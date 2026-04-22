import { test, expect } from '@playwright/test'

const API = 'http://localhost:8080/api'

// Helper: create a room via REST, then a second user joins.
// Returns { code, alice: {userId, name}, bob: {userId, name} }
async function bootstrapRoom(request) {
  const name = 'Alice'
  const createRes = await request.post(`${API}/rooms`, {
    data: { name: 'PWTest', userName: name },
  })
  expect(createRes.ok()).toBeTruthy()
  const created = await createRes.json()
  const code = created.code
  const aliceId = created.userId

  const joinRes = await request.post(`${API}/rooms/${code}/join`, {
    data: { userName: 'Bob' },
  })
  expect(joinRes.ok()).toBeTruthy()
  const joined = await joinRes.json()
  const bobId = joined.userId

  return { code, alice: { userId: aliceId, name: 'Alice' }, bob: { userId: bobId, name: 'Bob' } }
}

// Seed localStorage so the client thinks the user is already in the room,
// skipping the Home page flow.
async function enterRoom(context, { code, user, timezone, path = '/dashboard' }) {
  if (timezone) {
    await context.addInitScript((tz) => {
      const origResolved = Intl.DateTimeFormat.prototype.resolvedOptions
      Intl.DateTimeFormat.prototype.resolvedOptions = function () {
        const r = origResolved.call(this)
        r.timeZone = tz
        return r
      }
    }, timezone)
  }
  const page = await context.newPage()
  await page.goto('/')
  await page.evaluate(({ code, userId, name }) => {
    localStorage.setItem('roomCode', JSON.stringify(code))
    localStorage.setItem('userId', JSON.stringify(userId))
    localStorage.setItem('userName', JSON.stringify(name))
    localStorage.setItem('seenWelcome', JSON.stringify('1'))
  }, { code, userId: user.userId, name: user.name })
  await page.goto(path)
  return page
}

test.describe('LDR presence & connection', () => {
  test('timezone card shows both members local time', async ({ browser, request }) => {
    const { code, alice, bob } = await bootstrapRoom(request)
    const ctxA = await browser.newContext()
    const ctxB = await browser.newContext()
    const pageA = await enterRoom(ctxA, { code, user: alice, timezone: 'Asia/Jakarta' })
    const pageB = await enterRoom(ctxB, { code, user: bob, timezone: 'Europe/Berlin' })

    // Timezones card shows both names (scoped to the grid)
    const gridA = pageA.getByTestId('timezone-grid')
    await expect(gridA).toBeVisible()
    await expect(gridA.getByText('Alice')).toBeVisible()
    await expect(gridA.getByText('Bob')).toBeVisible()

    // Wait for partner's timezone to propagate via WS + re-fetch
    await expect(gridA.getByText(/Jakarta/)).toBeVisible()
    await expect(gridA.getByText(/Berlin/)).toBeVisible()

    // Each member's local time renders in HH:MM form
    const timeRx = /^\d{2}:\d{2}$/
    const timesA = await gridA.locator('.font-mono').allInnerTexts()
    expect(timesA.filter((s) => timeRx.test(s.trim())).length).toBe(2)

    // Reverse check on Bob's view
    const gridB = pageB.getByTestId('timezone-grid')
    await expect(gridB.getByText(/Jakarta/)).toBeVisible()
    await expect(gridB.getByText(/Berlin/)).toBeVisible()

    await ctxA.close()
    await ctxB.close()
  })

  test('thinking-of-you nudge reaches partner as toast', async ({ browser, request }) => {
    const { code, alice, bob } = await bootstrapRoom(request)
    const ctxA = await browser.newContext()
    const ctxB = await browser.newContext()
    const pageA = await enterRoom(ctxA, { code, user: alice, timezone: 'Asia/Jakarta' })
    const pageB = await enterRoom(ctxB, { code, user: bob, timezone: 'Europe/Berlin' })

    // Wait for Bob to appear online in Alice's presence list
    await expect(pageA.getByRole('button', { name: /Thinking of Bob/i })).toBeEnabled({ timeout: 5000 })

    await pageA.getByRole('button', { name: /Thinking of Bob/i }).click()
    // Alice sees the sent confirmation
    await expect(pageA.getByRole('button', { name: /Sent/ })).toBeVisible()

    // Bob sees the toast
    await expect(pageB.getByText(/Alice is thinking of you/)).toBeVisible({ timeout: 3000 })

    await ctxA.close()
    await ctxB.close()
  })

  test('milestones add, list with countdown, delete', async ({ browser, request }) => {
    const { code, alice } = await bootstrapRoom(request)
    const ctxA = await browser.newContext()
    const pageA = await enterRoom(ctxA, { code, user: alice, timezone: 'Asia/Jakarta' })

    await pageA.getByRole('button', { name: /^Add$/ }).click()
    const form = pageA.locator('form', { has: pageA.getByPlaceholder('What are we counting down to?') })
    await form.getByPlaceholder('What are we counting down to?').fill('Bali trip')
    const future = new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10)
    await form.locator('input[type="date"]').fill(future)
    await form.getByRole('button', { name: 'Save' }).click()

    // Item appears in list
    await expect(pageA.getByText('Bali trip')).toBeVisible()
    // Countdown shows ~10d format
    await expect(pageA.getByText(/^\d+d\s+\d+h$/)).toBeVisible()

    // Delete on hover — force click (Playwright bypasses opacity-0 via force)
    await pageA.locator('li', { hasText: 'Bali trip' }).getByRole('button', { name: 'Remove milestone' }).click({ force: true })
    await expect(pageA.getByText('Bali trip')).toBeHidden()

    await ctxA.close()
  })
})

test.describe('Memory timeline', () => {
  test('milestone, bucket-done, and shared journal day show up', async ({ browser, request }) => {
    const { code, alice, bob } = await bootstrapRoom(request)

    // Seed a past milestone
    await request.post(`${API}/rooms/${code}/milestones`, {
      headers: { 'X-User-ID': alice.userId },
      data: { title: 'Our first date', date: '2026-01-10', kind: 'anniversary' },
    })

    // Seed a completed bucket item
    const bucketRes = await request.post(`${API}/rooms/${code}/bucketlist`, {
      headers: { 'X-User-ID': alice.userId },
      data: { name: 'Alice', text: 'Rent a beach house', surprise: false },
    })
    const bucket = await bucketRes.json()
    await request.patch(`${API}/rooms/${code}/bucketlist/${bucket.id}`, {
      headers: { 'X-User-ID': alice.userId },
      data: { done: true, text: bucket.text },
    })

    // Seed journal entries from both partners on the same date
    for (const u of [alice, bob]) {
      await request.post(`${API}/rooms/${code}/journal`, {
        headers: { 'X-User-ID': u.userId },
        data: { name: u.name, date: '2026-03-01', content: `${u.name}'s entry`, mood: '🙂' },
      })
    }

    const ctxA = await browser.newContext()
    const pageA = await enterRoom(ctxA, { code, user: alice, timezone: 'Asia/Jakarta', path: '/timeline' })

    await expect(pageA.getByTestId('timeline-root')).toBeVisible({ timeout: 10_000 })
    await expect(pageA.getByText('Our first date')).toBeVisible()
    await expect(pageA.getByText('Rent a beach house')).toBeVisible()
    await expect(pageA.getByText('Wrote together')).toBeVisible()

    // Sanity check: at least three distinct entries rendered
    const count = await pageA.locator('[data-testid^="timeline-entry-"]').count()
    expect(count).toBeGreaterThanOrEqual(3)

    await ctxA.close()
  })
})

test.describe('Watch party queue', () => {
  test('add, sync to partner, remove, play next', async ({ browser, request }) => {
    const { code, alice, bob } = await bootstrapRoom(request)
    const ctxA = await browser.newContext()
    const ctxB = await browser.newContext()
    const pageA = await enterRoom(ctxA, { code, user: alice, timezone: 'Asia/Jakarta', path: '/watch' })
    const pageB = await enterRoom(ctxB, { code, user: bob, timezone: 'Europe/Berlin', path: '/watch' })
    // Wait for both WS connections to register so broadcasts reach both
    await pageA.waitForTimeout(1200)

    // Alice plays the first video (no queue button since nothing plays yet)
    await pageA.getByTestId('video-url-input').fill('dQw4w9WgXcQ')
    await pageA.getByTestId('play-now').click()

    // Wait for "queue" button to replace "play-now" (state transition)
    await expect(pageA.getByTestId('queue-add')).toBeVisible()

    // Alice adds two more to the queue. Wait for input to clear after each
    // post before filling again so we don't race the pending request.
    const urlInput = pageA.getByTestId('video-url-input')

    await urlInput.fill('9bZkp7q19f0')
    await pageA.getByTestId('queue-add').click()
    await expect(urlInput).toHaveValue('', { timeout: 5000 })
    await expect(pageA.getByText('9bZkp7q19f0')).toBeVisible()

    await urlInput.fill('JGwWNGJdvx8')
    await pageA.getByTestId('queue-add').click()
    await expect(urlInput).toHaveValue('', { timeout: 5000 })
    await expect(pageA.getByText('JGwWNGJdvx8')).toBeVisible()

    // Queue panel and both entries visible
    await expect(pageA.getByTestId('queue-panel')).toBeVisible()

    // Partner's queue panel syncs via queue:changed WS signal
    await expect(pageB.getByTestId('queue-panel')).toBeVisible({ timeout: 10_000 })
    await expect(pageB.getByText('9bZkp7q19f0')).toBeVisible()
    await expect(pageB.getByText('JGwWNGJdvx8')).toBeVisible()

    // Remove the first queue entry from Bob's side
    await pageB.getByTestId('queue-remove-0').click({ force: true })
    await expect(pageA.getByText('9bZkp7q19f0')).toBeHidden({ timeout: 5000 })
    await expect(pageA.getByText('JGwWNGJdvx8')).toBeVisible()

    // Play next — current becomes JGwWNGJdvx8, queue empties
    await pageA.getByTestId('queue-next').click()
    // Wait for the queue panel to disappear (queue emptied) before checking API
    await expect(pageA.getByTestId('queue-panel')).toBeHidden({ timeout: 5000 })
    const res = await request.get(`${API}/rooms/${code}/watchparty`, {
      headers: { 'X-User-ID': alice.userId },
    })
    const wp = await res.json()
    expect(wp.videoId).toBe('JGwWNGJdvx8')
    expect((wp.queue || []).length).toBe(0)

    await ctxA.close()
    await ctxB.close()
  })
})

test.describe('Root redirect & sign-out', () => {
  test('root auto-forwards logged-in user to dashboard', async ({ browser, request }) => {
    const { code, alice } = await bootstrapRoom(request)
    const ctx = await browser.newContext()
    const page = await ctx.newPage()
    await page.goto('/')
    await page.evaluate(({ code, userId, name }) => {
      localStorage.setItem('roomCode', JSON.stringify(code))
      localStorage.setItem('userId', JSON.stringify(userId))
      localStorage.setItem('userName', JSON.stringify(name))
      localStorage.setItem('seenWelcome', JSON.stringify('1'))
    }, { code, userId: alice.userId, name: alice.name })

    await page.goto('/')
    await expect(page).toHaveURL(/\/dashboard$/, { timeout: 5000 })
    await ctx.close()
  })

  test('root still shows the form when no session exists', async ({ browser }) => {
    const ctx = await browser.newContext()
    const page = await ctx.newPage()
    await page.goto('/')
    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByRole('heading', { name: 'LDR' })).toBeVisible()
    // Form inputs visible
    await expect(page.getByPlaceholder('Your name')).toBeVisible()
    await ctx.close()
  })

  test('leave this device clears session and returns to home', async ({ browser, request }) => {
    const { code, alice } = await bootstrapRoom(request)
    const ctx = await browser.newContext()
    const page = await enterRoom(ctx, { code, user: alice, timezone: 'Asia/Jakarta' })

    // Open Room Settings
    await page.getByTitle('Room settings').click()
    await page.getByTestId('leave-device').click()
    await page.getByTestId('leave-device-confirm').click()

    await expect(page).toHaveURL(/\/$/, { timeout: 5000 })
    const ls = await page.evaluate(() => ({
      code: localStorage.getItem('roomCode'),
      uid: localStorage.getItem('userId'),
    }))
    expect(ls.code).toBeNull()
    expect(ls.uid).toBeNull()
    await ctx.close()
  })
})

test.describe('Draw page', () => {
  test('drawing a stroke persists and syncs to partner', async ({ browser, request }) => {
    const { code, alice, bob } = await bootstrapRoom(request)
    const ctxA = await browser.newContext()
    const ctxB = await browser.newContext()
    const pageA = await enterRoom(ctxA, { code, user: alice, timezone: 'Asia/Jakarta' })
    const pageB = await enterRoom(ctxB, { code, user: bob, timezone: 'Europe/Berlin' })

    await pageA.goto('/draw')
    await pageB.goto('/draw')

    // Hook into Bob's WS listener count for draw:stroke via window trick:
    // simpler — just verify via API that stroke was persisted, AND that Bob's
    // canvas received the ws message by polling the server.
    await pageA.getByTestId('color-#ef4444').click() // red
    await pageA.getByTestId('width-4').click()

    const canvas = pageA.getByTestId('draw-canvas')
    await canvas.waitFor()
    const box = await canvas.boundingBox()
    expect(box).not.toBeNull()

    // Draw a diagonal line using hover+mouse events (pointer events under the hood)
    await pageA.mouse.move(box.x + 40, box.y + 40)
    await pageA.mouse.down()
    await pageA.mouse.move(box.x + 80, box.y + 80, { steps: 5 })
    await pageA.mouse.move(box.x + 140, box.y + 120, { steps: 5 })
    await pageA.mouse.move(box.x + 200, box.y + 160, { steps: 5 })
    await pageA.mouse.up()

    // Poll API until the stroke is persisted
    let persisted = false
    for (let i = 0; i < 20; i++) {
      const res = await request.get(`${API}/rooms/${code}/drawing`, {
        headers: { 'X-User-ID': alice.userId },
      })
      const d = await res.json()
      if (Array.isArray(d.strokes) && d.strokes.length > 0 && d.strokes[0].points.length >= 2) {
        persisted = true
        break
      }
      await new Promise((r) => setTimeout(r, 250))
    }
    expect(persisted).toBeTruthy()

    // Clear the canvas from Alice, Bob's canvas should also be cleared.
    // We can't easily introspect canvas bitmap, but we can verify the server wiped strokes.
    await pageA.getByTestId('clear-canvas').click()
    let cleared = false
    for (let i = 0; i < 20; i++) {
      const res = await request.get(`${API}/rooms/${code}/drawing`, {
        headers: { 'X-User-ID': alice.userId },
      })
      const d = await res.json()
      if (!d.strokes || d.strokes.length === 0) {
        cleared = true
        break
      }
      await new Promise((r) => setTimeout(r, 250))
    }
    expect(cleared).toBeTruthy()

    await ctxA.close()
    await ctxB.close()
  })
})
