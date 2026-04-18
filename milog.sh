#!/usr/bin/env bash
# ==============================================================================
# MiLog — Nginx + System Monitor (V5.0)
# ==============================================================================
set -euo pipefail

# --- Configuration ---
LOG_DIR="/var/log/nginx"
LOGS=("dolanan" "ethok" "finance" "ldr" "profile" "sinepil")
REFRESH=5

# Alert thresholds
THRESH_REQ_WARN=15
THRESH_REQ_CRIT=40
THRESH_CPU_WARN=70
THRESH_CPU_CRIT=90
THRESH_MEM_WARN=80
THRESH_MEM_CRIT=95
THRESH_DISK_WARN=80
THRESH_DISK_CRIT=95
THRESH_4XX_WARN=20
THRESH_5XX_WARN=5

# --- ANSI ---
R="\033[0;31m"  G="\033[0;32m"  Y="\033[0;33m"  B="\033[0;34m"
M="\033[0;35m"  C="\033[0;36m"  W="\033[1;37m"  D="\033[0;90m"
RBLINK="\033[0;31;5m"
NC="\033[0m"

# ==============================================================================
# BOX DRAWING — single source of truth for geometry
#
# Table columns: APP(10) | REQ/MIN(8) | STATUS(10) | INTENSITY(35)
# Row layout between outer │…│:
#   " " app(10) " │ " req(8) " │ " status(10) " │ " bar(35) " "
#   = 1+10 + 3+8 + 3+10 + 3+35+1 = 74
# Box rules:  ─(12)┬─(10)┬─(12)┬─(37) = 12+1+10+1+12+1+37 = 74  ✓
# ==============================================================================
W_APP=10; W_REQ=8; W_ST=10; W_BAR=35
INNER=74   # verified: row chars == rule chars == 74

spc() { printf '%*s' "$1" ''; }
hrule() { printf '─%.0s' $(seq 1 "$1"); }

# Single-box rules — all share INNER=74
bdr_top() { printf "${W}┌$(hrule $((W_APP+2)))┬$(hrule $((W_REQ+2)))┬$(hrule $((W_ST+2)))┬$(hrule $((W_BAR+2)))┐${NC}\n"; }
bdr_hdr() { printf "${W}├$(hrule $((W_APP+2)))┼$(hrule $((W_REQ+2)))┼$(hrule $((W_ST+2)))┼$(hrule $((W_BAR+2)))┤${NC}\n"; }
bdr_mid() { printf "${W}├$(hrule $((INNER)))┤${NC}\n"; }
bdr_sep() { printf "${W}├$(hrule $((W_APP+2)))┴$(hrule $((W_REQ+2)))┴$(hrule $((W_ST+2)))┴$(hrule $((W_BAR+2)))┤${NC}\n"; }
bdr_bot() { printf "${W}└$(hrule $((INNER)))┘${NC}\n"; }

# Full-width content row: │ plain/colored content + padding │
# $1=plain_text (for measuring)  $2=colored_text (for printing)
# Plain must not contain any ANSI sequences.
draw_row() {
    local plain="$1" colored="$2"
    local pad=$(( INNER - ${#plain} ))
    printf "${W}│${NC}%b" "$colored"
    [[ $pad -gt 0 ]] && spc "$pad"
    printf "${W}│${NC}\n"
}

# Table data row — padding computed from plain args only
# $1=name $2=count $3=st_plain(10 chars) $4=st_colored $5=bars_plain $6=bars_colored $7=alert_color
trow() {
    local name="$1" count="$2" st_plain="$3" st_col="$4" bars_plain="$5" bars_col="$6" alert="${7:-}"
    local n_pad=$(( W_APP - ${#name}       ))
    local r_pad=$(( W_REQ - ${#count}      ))
    local b_pad=$(( W_BAR - ${#bars_plain} ))
    printf "${W}│${NC} %b%s${NC}" "$alert" "$name";  spc "$n_pad"
    printf " ${W}│${NC} %s"       "$count";           spc "$r_pad"
    printf " ${W}│${NC} %b"       "$st_col"
    printf " ${W}│${NC} %b"       "$bars_col";        spc "$b_pad"
    printf " ${W}│${NC}\n"
}

# Column header row (no color escape issues — plain printf)
hdr_row() {
    printf "${W}│${NC} %-${W_APP}s ${W}│${NC} %-${W_REQ}s ${W}│${NC} %-${W_ST}s ${W}│${NC} %-${W_BAR}s ${W}│${NC}\n" \
        "APP" "REQ/MIN" "STATUS" "INTENSITY"
}

# ==============================================================================
# SYSTEM METRICS
# ==============================================================================

cpu_usage() {
    local s1 s2 t1 i1 t2 i2
    s1=$(awk '/^cpu /{print $2+$3+$4+$5+$6+$7+$8, $5}' /proc/stat)
    sleep 0.2
    s2=$(awk '/^cpu /{print $2+$3+$4+$5+$6+$7+$8, $5}' /proc/stat)
    read -r t1 i1 <<< "$s1"; read -r t2 i2 <<< "$s2"
    local dt=$(( t2-t1 )) di=$(( i2-i1 ))
    [[ $dt -eq 0 ]] && echo 0 || echo $(( 100*(dt-di)/dt ))
}

mem_info() {
    awk '/MemTotal/{t=$2}/MemAvailable/{a=$2}
         END{u=t-a; printf "%d %d %d\n", int(u*100/t), int(u/1024), int(t/1024)}' /proc/meminfo
}

disk_info() {
    df / | awk 'NR==2{gsub(/%/,"",$5); printf "%d %.1f %.1f\n",$5,$3/1048576,$2/1048576}'
}

net_rx_tx() {
    local iface
    iface=$(ip route 2>/dev/null | awk '/^default/{print $5;exit}')
    [[ -z "$iface" ]] && iface=$(ls /sys/class/net/ | grep -v lo | head -1)
    local rx tx
    rx=$(cat /sys/class/net/"$iface"/statistics/rx_bytes 2>/dev/null || echo 0)
    tx=$(cat /sys/class/net/"$iface"/statistics/tx_bytes 2>/dev/null || echo 0)
    echo "$rx $tx $iface"
}

fmt_bytes() {
    local b=$1
    if   (( b >= 1073741824 )); then awk "BEGIN{printf \"%.1fGB\",$b/1073741824}"
    elif (( b >= 1048576 ));    then awk "BEGIN{printf \"%.1fMB\",$b/1048576}"
    elif (( b >= 1024 ));       then awk "BEGIN{printf \"%.1fKB\",$b/1024}"
    else printf "%dB" "$b"
    fi
}

# ASCII progress bar using only hyphen and equals — no wide-glyph block chars
# $1=width  $2=value  $3=max → prints exactly $1 chars
ascii_bar() {
    local width=$1 val=$2 max=${3:-100}
    [[ $max -le 0 ]] && max=1
    local f=$(( val * width / max ))
    [[ $f -gt $width ]] && f=$width
    local e=$(( width - f ))
    local i
    for (( i=0; i<f; i++ )); do printf '|'; done
    for (( i=0; i<e; i++ )); do printf '.'; done
}

tcol() {
    local v=$1 w=$2 c=$3
    (( v >= c )) && { printf '%s' "$R"; return; }
    (( v >= w )) && { printf '%s' "$Y"; return; }
    printf '%s' "$G"
}

# ==============================================================================
# NGINX ROW HELPERS
# ==============================================================================

nginx_row() {
    local name="$1" CUR_TIME="$2" TOTAL_ref="$3"
    local file="$LOG_DIR/$name.access.log"
    local count=0 c4=0 c5=0
    count=$(grep -c "$CUR_TIME" "$file" 2>/dev/null || true)
    [[ -z "$count" ]] && count=0
    # shellcheck disable=SC2034
    eval "$TOTAL_ref=$(( ${!TOTAL_ref} + count ))"

    if [[ $count -gt 0 ]]; then
        c4=$(grep "$CUR_TIME" "$file" 2>/dev/null | grep -c ' 4[0-9][0-9] ' || true)
        c5=$(grep "$CUR_TIME" "$file" 2>/dev/null | grep -c ' 5[0-9][0-9] ' || true)
    fi

    local st_plain st_col b_col alert=""
    if [[ $count -gt 0 ]]; then
        st_plain="● ACTIVE  "; st_col="${G}● ACTIVE  ${NC}"; b_col=$G
        [[ $count -gt $THRESH_REQ_WARN ]] && b_col=$Y
        [[ $count -gt $THRESH_REQ_CRIT ]] && { b_col=$R; st_col="${R}● ACTIVE  ${NC}"; }
    else
        st_plain="○ IDLE    "; st_col="${D}○ IDLE    ${NC}"; b_col=$D
    fi

    [[ $c5 -ge $THRESH_5XX_WARN ]]                   && alert="$RBLINK"
    [[ $c4 -ge $THRESH_4XX_WARN && -z "$alert" ]]    && alert="$R"
    [[ $count -gt $THRESH_REQ_CRIT && -z "$alert" ]] && alert="$R"

    local bc=$(( count / 2 ))
    [[ $bc -gt $W_BAR ]] && bc=$W_BAR
    local bars_plain bars_col
    if [[ $bc -gt 0 ]]; then
        bars_plain=$(printf '|%.0s' $(seq 1 $bc))
        bars_col="${b_col}${bars_plain}${NC}"
    else
        bars_plain="-"; bars_col="${D}-${NC}"
    fi

    # Append error tag, trimming bar to fit
    if [[ $c4 -gt 0 || $c5 -gt 0 ]]; then
        local etag_p=" 4xx:${c4} 5xx:${c5}"
        local etag_c=" ${Y}4xx:${c4}${NC} ${R}5xx:${c5}${NC}"
        local max_b=$(( W_BAR - ${#etag_p} ))
        [[ ${#bars_plain} -gt $max_b ]] && {
            bars_plain="${bars_plain:0:$max_b}"
            bars_col="${b_col}${bars_plain}${NC}"
        }
        bars_plain="${bars_plain}${etag_p}"
        bars_col="${bars_col}${etag_c}"
    fi

    trow "$name" "$count" "$st_plain" "$st_col" "$bars_plain" "$bars_col" "$alert"
}

# ==============================================================================
# MODE: monitor
# ==============================================================================
mode_monitor() {
    local net_prev_rx=0 net_prev_tx=0
    read -r net_prev_rx net_prev_tx _ <<< "$(net_rx_tx)"

    while true; do
        clear
        local CUR_TIME TIMESTAMP TOTAL=0
        CUR_TIME=$(date '+%d/%b/%Y:%H:%M')
        TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

        local cpu mem_pct mem_used mem_total disk_pct disk_used disk_total
        cpu=$(cpu_usage)
        read -r mem_pct mem_used mem_total <<< "$(mem_info)"
        read -r disk_pct disk_used disk_total <<< "$(disk_info)"

        local net_rx net_tx net_iface
        read -r net_rx net_tx net_iface <<< "$(net_rx_tx)"
        local drx=$(( net_rx - net_prev_rx ))
        local dtx=$(( net_tx - net_prev_tx ))
        net_prev_rx=$net_rx; net_prev_tx=$net_tx
        local rx_s tx_s; rx_s=$(fmt_bytes "$drx"); tx_s=$(fmt_bytes "$dtx")

        local cpu_col mem_col disk_col
        cpu_col=$(tcol "$cpu"      $THRESH_CPU_WARN  $THRESH_CPU_CRIT)
        mem_col=$(tcol "$mem_pct"  $THRESH_MEM_WARN  $THRESH_MEM_CRIT)
        disk_col=$(tcol "$disk_pct" $THRESH_DISK_WARN $THRESH_DISK_CRIT)

        local BW=11  # bar width: (INNER=74 - 39 fixed chars) / 3 cols = 11 max
        local cpu_bar mem_bar disk_bar
        cpu_bar=$(ascii_bar $BW "$cpu"      100)
        mem_bar=$(ascii_bar $BW "$mem_pct"  100)
        disk_bar=$(ascii_bar $BW "$disk_pct" 100)

        # --- Single unified box starts here ---
        bdr_top

        # Title row
        local t_p=" MiLog   ${TIMESTAMP}   ${net_iface}"
        local t_c=" ${W}MiLog${NC}   ${D}${TIMESTAMP}${NC}   ${D}${net_iface}${NC}"
        draw_row "$t_p" "$t_c"

        bdr_mid

        # System metrics row 1 — bars
        # Plain: " CPU  xx% [bar18]  MEM  xx% [bar18]  DISK  xx% [bar18]"
        local r1_p
        r1_p=$(printf " CPU %3d%% [%-${BW}s]  MEM %3d%% [%-${BW}s]  DISK %3d%% [%-${BW}s]" \
            "$cpu" "$cpu_bar" "$mem_pct" "$mem_bar" "$disk_pct" "$disk_bar")
        local r1_c
        r1_c=$(printf " CPU %b%3d%%%b [%b%s%b]  MEM %b%3d%%%b [%b%s%b]  DISK %b%3d%%%b [%b%s%b]" \
            "$cpu_col"  "$cpu"      "$NC" "$cpu_col"  "$cpu_bar"  "$NC" \
            "$mem_col"  "$mem_pct"  "$NC" "$mem_col"  "$mem_bar"  "$NC" \
            "$disk_col" "$disk_pct" "$NC" "$disk_col" "$disk_bar" "$NC")
        draw_row "$r1_p" "$r1_c"

        # System metrics row 2 — detail + net
        # Max visible: ' MEM 99999/99999MB  DISK 999.9/999.9GB  dn:999.9MB/s up:999.9MB/s' = 72
        local r2_p=" MEM ${mem_used}/${mem_total}MB  DISK ${disk_used}/${disk_total}GB  dn:${rx_s}/s up:${tx_s}/s"
        local r2_c=" ${D}MEM${NC} ${mem_used}/${mem_total}MB  ${D}DISK${NC} ${disk_used}/${disk_total}GB  ${C}dn:${rx_s}/s${NC} ${G}up:${tx_s}/s${NC}"
        draw_row "$r2_p" "$r2_c"

        bdr_mid

        # Nginx workers
        draw_row " NGINX WORKERS" " ${W}NGINX WORKERS${NC}"
        local workers
        workers=$(ps aux 2>/dev/null | awk '/nginx: worker/{printf "  pid:%-8s  cpu:%5s%%  mem:%5s%%\n",$2,$3,$4}' | head -6)
        if [[ -z "$workers" ]]; then
            draw_row "  (no nginx worker processes found)" "  ${D}(no nginx worker processes found)${NC}"
        else
            while IFS= read -r wline; do
                draw_row "$wline" "  ${D}${wline:2}${NC}"
            done <<< "$workers"
        fi

        bdr_mid

        # Nginx per-app table (no nested box — continues same box with col separators)
        bdr_hdr
        hdr_row
        bdr_hdr

        for name in "${LOGS[@]}"; do
            nginx_row "$name" "$CUR_TIME" TOTAL
        done

        bdr_sep

        # Footer
        local upstr; upstr=$(uptime -p 2>/dev/null | sed 's/up //' || echo 'n/a')
        local f_p=" TOTAL: ${TOTAL} req/min   UP: ${upstr}"
        local f_c=" ${W}TOTAL:${NC} ${TOTAL} req/min   ${D}UP: ${upstr}${NC}"
        draw_row "$f_p" "$f_c"

        bdr_bot
        printf "${D} Ctrl+C to exit  |  Refresh: ${REFRESH}s  |  blink=5xx>=${THRESH_5XX_WARN}  red=4xx>=${THRESH_4XX_WARN} or req>=${THRESH_REQ_CRIT}${NC}\n"

        sleep "$REFRESH"
    done
}

# ==============================================================================
# MODE: rate — nginx-only
# ==============================================================================
mode_rate() {
    while true; do
        clear
        local CUR_TIME TIMESTAMP TOTAL=0
        CUR_TIME=$(date '+%d/%b/%Y:%H:%M')
        TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

        bdr_top
        draw_row " MiLog   ${TIMESTAMP}" " ${W}MiLog${NC}   ${D}${TIMESTAMP}${NC}"
        bdr_mid
        bdr_hdr
        hdr_row
        bdr_hdr

        for name in "${LOGS[@]}"; do
            nginx_row "$name" "$CUR_TIME" TOTAL
        done

        bdr_sep
        draw_row " TOTAL: ${TOTAL} req/min" " ${W}TOTAL:${NC} ${TOTAL} req/min"
        bdr_bot
        printf "${D} Ctrl+C to exit  |  Refresh: ${REFRESH}s${NC}\n"
        sleep "$REFRESH"
    done
}

# ==============================================================================
# MODE: health
# ==============================================================================
mode_health() {
    echo -e "\n${W}── MiLog: Status Code Health ──${NC}\n"
    printf "%-12s  %8s  %8s  %8s  %8s  %8s\n" "APP" "TOTAL" "2xx" "3xx" "4xx" "5xx"
    printf "%-12s  %8s  %8s  %8s  %8s  %8s\n" "───────────" "───────" "───────" "───────" "───────" "───────"
    for name in "${LOGS[@]}"; do
        local file="$LOG_DIR/$name.access.log"
        [[ -f "$file" ]] || { printf "%-12s  %8s\n" "$name" "(not found)"; continue; }
        local total s2=0 s3=0 s4=0 s5=0
        total=$(wc -l < "$file")
        s2=$(grep -c ' 2[0-9][0-9] ' "$file" 2>/dev/null || true)
        s3=$(grep -c ' 3[0-9][0-9] ' "$file" 2>/dev/null || true)
        s4=$(grep -c ' 4[0-9][0-9] ' "$file" 2>/dev/null || true)
        s5=$(grep -c ' 5[0-9][0-9] ' "$file" 2>/dev/null || true)
        local c4=$NC c5=$NC
        [[ $s4 -gt $THRESH_4XX_WARN ]] && c4=$Y
        [[ $s5 -gt $THRESH_5XX_WARN ]] && c5=$R
        printf "%-12s  %8s  %8s  %8s  ${c4}%8s${NC}  ${c5}%8s${NC}\n" \
            "$name" "$total" "$s2" "$s3" "$s4" "$s5"
    done
    echo ""
}

# ==============================================================================
# MODE: top
# ==============================================================================
mode_top() {
    local n="${1:-10}"
    echo -e "\n${W}── MiLog: Top ${n} IPs ──${NC}\n"
    printf "%-5s  %-18s  %10s\n" "RANK" "IP" "REQUESTS"
    printf "%-5s  %-18s  %10s\n" "────" "─────────────────" "────────"
    local tmp; tmp=$(mktemp)
    for name in "${LOGS[@]}"; do
        [[ -f "$LOG_DIR/$name.access.log" ]] && awk '{print $1}' "$LOG_DIR/$name.access.log" >> "$tmp"
    done
    sort "$tmp" | uniq -c | sort -rn | head -n "$n" | \
    awk -v r="$R" -v y="$Y" -v nc="$NC" 'BEGIN{i=1}{
        col=""; if(i==1)col=r; else if(i<=3)col=y
        printf "%-5s  %-18s  %s%10s%s\n","#"i,$2,col,$1,nc; i++}'
    rm -f "$tmp"; echo ""
}

# ==============================================================================
# MODE: stats
# ==============================================================================
mode_stats() {
    local name="${1:-}"
    [[ -z "$name" || ! " ${LOGS[*]} " =~ " $name " ]] && {
        echo -e "${R}Usage: $0 stats <app>${NC}  Apps: ${LOGS[*]}"; exit 1; }
    local file="$LOG_DIR/$name.access.log"
    [[ -f "$file" ]] || { echo -e "${R}Not found: $file${NC}"; exit 1; }
    echo -e "\n${W}── MiLog: Hourly breakdown — ${name} ──${NC}\n"
    awk '{match($4,/\[([0-9]{2}\/[A-Za-z]+\/[0-9]{4}):([0-9]{2})/,a)
         if(a[2]!="")h[a[2]]++}
         END{for(x in h)print x,h[x]}' "$file" | sort | \
    awk -v g="$G" -v y="$Y" -v r="$R" -v nc="$NC" '
    BEGIN{max=0}{if($2>max)max=$2;d[NR]=$0;n=NR}
    END{for(i=1;i<=n;i++){split(d[i],a," ")
        b=int((a[2]/max)*40); bars=""
        for(j=0;j<b;j++) bars=bars"|"
        col=g; if(a[2]/max>0.6)col=y; if(a[2]/max>0.85)col=r
        printf "%s:00  %s%-40s%s  %d\n",a[1],col,bars,nc,a[2]}}'
    echo ""
}

# ==============================================================================
# MODE: grep
# ==============================================================================
mode_grep() {
    local name="${1:-}" pattern="${2:-.}"
    [[ -z "$name" || ! " ${LOGS[*]} " =~ " $name " ]] && {
        echo -e "${R}Usage: $0 grep <app> <pattern>${NC}  Apps: ${LOGS[*]}"; exit 1; }
    echo -e "${D}tail -f $LOG_DIR/$name.access.log | grep '$pattern'  (Ctrl+C)${NC}\n"
    tail -f "$LOG_DIR/$name.access.log" | grep --line-buffered -i "$pattern"
}

# ==============================================================================
# MODE: errors
# ==============================================================================
mode_errors() {
    echo -e "${D}Watching 4xx/5xx across all apps... (Ctrl+C)${NC}\n"
    local pids=() colors=("$B" "$C" "$G" "$M" "$Y" "$R") i=0
    for name in "${LOGS[@]}"; do
        local file="$LOG_DIR/$name.access.log"
        local col="${colors[$i]}" label
        label=$(printf "%-8s" "$name")
        if [[ -f "$file" ]]; then
            tail -f "$file" 2>/dev/null | \
                grep --line-buffered ' [45][0-9][0-9] ' | \
                awk -v col="$col" -v lbl="$label" -v nc="$NC" \
                    '{print col"["lbl"]"nc" "$0; fflush()}' &
            pids+=($!)
        fi
        (( i++ )) || true
    done
    trap 'kill "${pids[@]}" 2>/dev/null; exit' INT TERM
    wait
}

# ==============================================================================
# COLOR PREFIX — background-process tail, one per app with hardcoded color
# ==============================================================================
color_prefix() {
    # Spawn a separate tail for each app so color is always known — avoids
    # relying on "==> filename <==" headers which GNU tail only emits once.
    local pids=()
    local colors=("$B" "$C" "$G" "$M" "$Y" "$R")
    local i=0
    for name in "${LOGS[@]}"; do
        local file="$LOG_DIR/$name.access.log"
        local col="${colors[$i]}"
        local label
        label=$(printf "%-8s" "$name")
        if [[ -f "$file" ]]; then
            tail -f "$file" 2>/dev/null | \
                awk -v col="$col" -v lbl="$label" -v nc="$NC" \
                    '{print col"["lbl"]"nc" "$0; fflush()}' &
            pids+=($!)
        fi
        (( i++ )) || true
    done
    # Wait; kill all background tails on Ctrl+C
    trap 'kill "${pids[@]}" 2>/dev/null; exit' INT TERM
    wait
}

# ==============================================================================
# HELP
# ==============================================================================
show_help() {
    echo -e "
${W}MiLog${NC} — nginx + system monitor

${W}USAGE${NC}  $0 [command] [args]

${W}DASHBOARDS${NC}
  ${C}monitor${NC}            full TUI: nginx + CPU/MEM/DISK/NET + workers
  ${C}rate${NC}               nginx-only req/min dashboard

${W}ANALYSIS${NC}
  ${C}health${NC}             2xx/3xx/4xx/5xx per app
  ${C}top [N]${NC}            top N source IPs  ${D}(default: 10)${NC}
  ${C}stats <app>${NC}        hourly request histogram

${W}TAILING${NC}
  ${C}(none) / logs${NC}      tail all logs, color prefixed  ${D}<- default${NC}
  ${C}errors${NC}             4xx/5xx lines only
  ${C}probes${NC}             scanner/bot traffic
  ${C}grep <app> <pat>${NC}   filter-tail one app
  ${C}<app>${NC}              raw tail for one app

${W}THRESHOLDS${NC}
  req/min  warn=${THRESH_REQ_WARN}  crit=${THRESH_REQ_CRIT}
  cpu      warn=${THRESH_CPU_WARN}%  crit=${THRESH_CPU_CRIT}%
  mem      warn=${THRESH_MEM_WARN}%  crit=${THRESH_MEM_CRIT}%
  4xx      warn=${THRESH_4XX_WARN}   5xx warn=${THRESH_5XX_WARN}

${W}APPS${NC}  ${LOGS[*]}
"
}

# ==============================================================================
# DISPATCH
# ==============================================================================
FILES=()
for l in "${LOGS[@]}"; do FILES+=("$LOG_DIR/$l.access.log"); done

case "${1:-}" in
    monitor)  mode_monitor ;;
    rate)     mode_rate ;;
    health)   mode_health ;;
    top)      mode_top "${2:-10}" ;;
    stats)    mode_stats "${2:-}" ;;
    grep)     mode_grep "${2:-}" "${3:-.}" ;;
    errors)   mode_errors ;;
    probes)   tail -f "${FILES[@]}" | grep --line-buffered -Ei 'SSH-2\.0|\\x16\\x03|masscan|zgrab|nmap|nuclei|sqlmap|gobuster|nikto|curl|wget' ;;
    -h|--help|help) show_help ;;
    ""|logs)  tail -f "${FILES[@]}" | color_prefix ;;
    *)
        if [[ " ${LOGS[*]} " =~ " $1 " ]]; then
            tail -f "$LOG_DIR/$1.access.log"
        else
            echo -e "${R}Unknown command: '$1'${NC}"; show_help; exit 1
        fi ;;
esac
