const prisma = require('../config/database')
const notificationService = require('./notificationService')
const { formatDDMMYYYY, formatTime24 } = require('../utils/dateUtils')

function dateUtilsFallback() {
  const pad2 = (n) => String(n).padStart(2, '0')
  return {
    formatDDMMYYYY: (d) => {
      if (!d) return ''
      const dt = d instanceof Date ? d : new Date(d)
      if (Number.isNaN(dt.getTime())) return ''
      return `${pad2(dt.getDate())}/${pad2(dt.getMonth() + 1)}/${dt.getFullYear()}`
    },
    formatTime24: (d) => {
      if (!d) return ''
      const dt = d instanceof Date ? d : new Date(d)
      if (Number.isNaN(dt.getTime())) return ''
      return `${pad2(dt.getHours())}:${pad2(dt.getMinutes())}`
    }
  }
}

class CalendarReminderService {
  constructor() {
    this._timer = null
    this._running = false
    const dtls = dateUtilsFallback()
    this._formatDDMMYYYY = formatDDMMYYYY || dtls.formatDDMMYYYY
    this._formatTime24 = formatTime24 || dtls.formatTime24
  }

  async processDueReminders(now = new Date()) {
    const lookaheadMs = 10 * 60 * 1000
    const lookahead = new Date(now.getTime() + lookaheadMs)

    const dueReminders = await prisma.calendarEventReminder.findMany({
      where: {
        delivered: false,
        reminderType: 'IN_APP'
      },
      include: {
        user: {
          select: {
            id: true,
            status: true,
            email: true,
            firstName: true,
            lastName: true
          }
        },
        calendarEvent: {
          select: {
            id: true,
            title: true,
            description: true,
            startDateTime: true,
            endDateTime: true,
            isAllDay: true,
            category: true,
            userId: true,
            assigneeId: true,
            customEvent: {
              select: {
                location: true
              }
            }
          }
        }
      }
    })

    const toDeliver = []
    for (const r of dueReminders) {
      if (!r.calendarEvent || !r.user) continue
      if (r.user.status !== 'ACTIVE') continue

      const start = new Date(r.calendarEvent.startDateTime)
      if (Number.isNaN(start.getTime())) continue

      const remindAt = new Date(start.getTime() - r.offsetMinutes * 60 * 1000)
      if (remindAt.getTime() > lookahead.getTime()) continue

      toDeliver.push({ reminder: r, remindAt })
    }

    toDeliver.sort((a, b) => a.remindAt.getTime() - b.remindAt.getTime())

    let deliveredCount = 0
    for (const { reminder } of toDeliver) {
      try {
        const evt = reminder.calendarEvent
        const userId = reminder.userId
        const isOwner = evt.userId === userId
        const isAssignee = evt.assigneeId === userId
        let roleLabel = 'Viewer'
        if (isOwner) roleLabel = 'Owner'
        else if (isAssignee) roleLabel = 'Assignee'

        const startStr = evt.isAllDay
          ? this._formatDDMMYYYY(evt.startDateTime)
          : `${this._formatDDMMYYYY(evt.startDateTime)} ${this._formatTime24(evt.startDateTime)}`

        const endStr = evt.endDateTime
          ? (evt.isAllDay
              ? this._formatDDMMYYYY(evt.endDateTime)
              : this._formatTime24(evt.endDateTime))
          : null

        const timeDisplay = endStr
          ? `${startStr} — ${endStr}`
          : startStr

        const title = `Calendar Reminder: ${evt.title}`
        const bodyParts = []
        bodyParts.push(`Your ${roleLabel.toLowerCase()} event is coming up.`)
        bodyParts.push(`When: ${timeDisplay}`)
        if (evt.customEvent?.location) bodyParts.push(`Location: ${evt.customEvent.location}`)
        if (evt.description) bodyParts.push(`Details: ${evt.description}`)

        const message = bodyParts.join(' ')
        const link = '/calendar'

        await notificationService.sendNotification(
          userId,
          'calendarReminder',
          title,
          message,
          link,
          {
            eventId: evt.id,
            eventTitle: evt.title,
            eventCategory: evt.category,
            eventStart: evt.startDateTime,
            eventEnd: evt.endDateTime,
            eventIsAllDay: evt.isAllDay,
            eventLocation: evt.customEvent?.location || null,
            offsetMinutes: reminder.offsetMinutes,
            role: roleLabel,
            link: notificationService.buildAbsoluteLink(link)
          }
        )

        await prisma.calendarEventReminder.update({
          where: { id: reminder.id },
          data: { delivered: true, deliveredAt: new Date() }
        })
        deliveredCount++
      } catch (e) {
        console.error(`Failed to deliver calendar reminder ${reminder.id}:`, e)
      }
    }

    return deliveredCount
  }

  scheduleProcessing(intervalMs = 5 * 60 * 1000) {
    if (this._timer) {
      clearInterval(this._timer)
      this._timer = null
    }

    const run = async () => {
      if (this._running) return
      this._running = true
      try {
        const count = await this.processDueReminders()
        if (count > 0) {
          console.log(`Calendar reminder processor: delivered ${count} notification(s)`)
        }
      } catch (error) {
        console.error('Calendar reminder processor failed:', error)
      } finally {
        this._running = false
      }
    }

    setImmediate(run)
    this._timer = setInterval(run, intervalMs)
  }
}

module.exports = new CalendarReminderService()
