import { useEffect, useState } from 'react'
import { listOwnerMeetings } from './api/generated/sdk.gen'
import type { OwnerMeeting } from './api/generated/types.gen'
import OwnerCalendar from './OwnerCalendar'

function localDateKey(value: string, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone,
  }).formatToParts(new Date(value))
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((candidate) => candidate.type === type)?.value
  return `${part('year')}-${part('month')}-${part('day')}`
}

function formatTime(value: string, timeZone: string) {
  return new Intl.DateTimeFormat('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone,
  }).format(new Date(value))
}

function OwnerMeetingsPage() {
  const [meetings, setMeetings] = useState<OwnerMeeting[]>([])
  const [loading, setLoading] = useState(true)
  const [loadFailed, setLoadFailed] = useState(false)
  const [loadAttempt, setLoadAttempt] = useState(0)

  useEffect(() => {
    let active = true

    listOwnerMeetings()
      .then(({ data, response }) => {
        if (!active) return
        if (response.ok && data) {
          setMeetings(data)
          setLoading(false)
        } else {
          setLoadFailed(true)
          setLoading(false)
        }
      })
      .catch(() => {
        if (!active) return
        setLoadFailed(true)
        setLoading(false)
      })

    return () => {
      active = false
    }
  }, [loadAttempt])

  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  const groups = new Map<string, OwnerMeeting[]>()
  meetings.forEach((meeting) => {
    const key = localDateKey(meeting.startsAt, timeZone)
    groups.set(key, [...(groups.get(key) ?? []), meeting])
  })

  return (
    <main className="owner-content">
      <h1>Встречи</h1>
      {loading && <p role="status">Загрузка…</p>}
      {loadFailed && (
        <div role="alert">
          <p>Не удалось загрузить встречи</p>
          <button
            type="button"
            onClick={() => {
              setLoading(true)
              setLoadFailed(false)
              setLoadAttempt((value) => value + 1)
            }}
          >
            Повторить
          </button>
        </div>
      )}
      {!loading && !loadFailed && meetings.length === 0 && (
        <p>Предстоящих встреч пока нет</p>
      )}
      {!loading && !loadFailed && (
        <p className="owner-time-zone">Часовой пояс: {timeZone}</p>
      )}
      <div className="meeting-groups">
        {[...groups.entries()].map(([date, dateMeetings]) => (
          <section key={date} className="meeting-date-group">
            <h2>
              {new Intl.DateTimeFormat('ru-RU', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
                year: 'numeric',
                timeZone,
              }).format(new Date(dateMeetings[0].startsAt))}
            </h2>
            {dateMeetings.map((meeting) => (
              <article key={meeting.id} className="owner-meeting-card">
                <h3>{meeting.meetingType.name}</h3>
                {meeting.inProgress && (
                  <p className="meeting-progress">Идёт сейчас</p>
                )}
                <p>
                  {formatTime(meeting.startsAt, timeZone)}–
                  {formatTime(meeting.endsAt, timeZone)} · {meeting.durationMinutes} мин
                </p>
                <p>{meeting.guestName}</p>
                <a href={`mailto:${meeting.guestEmail}`}>{meeting.guestEmail}</a>
              </article>
            ))}
          </section>
        ))}
      </div>
      {!loading && !loadFailed && (
        <OwnerCalendar meetings={meetings} timeZone={timeZone} />
      )}
    </main>
  )
}

export default OwnerMeetingsPage
