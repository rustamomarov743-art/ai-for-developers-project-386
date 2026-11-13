import { useCallback, useState } from 'react'
import { cancelMeeting, listOwnerMeetings } from './api/generated/sdk.gen'
import type { OwnerMeeting } from './api/generated/types.gen'
import OwnerCalendar from './OwnerCalendar'
import { formatTime, localDateKey } from './dateTime'
import { useApiRequest } from './useApiRequest'

function OwnerMeetingsPage() {
  const [meetings, setMeetings] = useState<OwnerMeeting[]>([])
  const [loading, setLoading] = useState(true)
  const [loadFailed, setLoadFailed] = useState(false)
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [meetingToCancel, setMeetingToCancel] = useState<OwnerMeeting | null>(null)
  const [cancelling, setCancelling] = useState(false)
  const [cancellationMessage, setCancellationMessage] = useState('')

  const request = useCallback(() => listOwnerMeetings(), [])
  const handleSuccess = useCallback((data: OwnerMeeting[]) => {
    setMeetings(data)
    setLoading(false)
  }, [])
  const handleFailure = useCallback(() => {
    setLoadFailed(true)
    setLoading(false)
  }, [])
  useApiRequest(loadAttempt, request, handleSuccess, handleFailure)

  async function confirmCancellation() {
    if (!meetingToCancel) return
    setCancelling(true)
    try {
      const { data, error, response } = await cancelMeeting({
        path: { id: meetingToCancel.id },
      })
      if (response.ok && data) {
        setMeetings((current) =>
          current.filter((meeting) => meeting.id !== meetingToCancel.id),
        )
        setMeetingToCancel(null)
        setCancellationMessage('Встреча отменена')
      } else if (error?.code === 'MEETING_ALREADY_STARTED') {
        setMeetingToCancel(null)
        setCancellationMessage('Встречу нельзя отменить после начала')
        setLoadAttempt((value) => value + 1)
      } else {
        setCancellationMessage('Не удалось отменить встречу. Попробуйте ещё раз')
      }
    } catch {
      setCancellationMessage('Не удалось отменить встречу. Попробуйте ещё раз')
    } finally {
      setCancelling(false)
    }
  }

  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  const groups = new Map<string, OwnerMeeting[]>()
  meetings.forEach((meeting) => {
    const key = localDateKey(meeting.startsAt, timeZone)
    groups.set(key, [...(groups.get(key) ?? []), meeting])
  })

  return (
    <main className="owner-content">
      <h1>Встречи</h1>
      {cancellationMessage && <p role="status">{cancellationMessage}</p>}
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
                {!meeting.inProgress && (
                  <button type="button" onClick={() => setMeetingToCancel(meeting)}>
                    Отменить встречу
                  </button>
                )}
              </article>
            ))}
          </section>
        ))}
      </div>
      {!loading && !loadFailed && (
        <OwnerCalendar meetings={meetings} timeZone={timeZone} />
      )}
      {meetingToCancel && (
        <div className="dialog-backdrop">
          <section
            className="cancellation-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="cancellation-dialog-title"
          >
            <h2 id="cancellation-dialog-title">Отменить встречу?</h2>
            <p>{meetingToCancel.meetingType.name}</p>
            <p>{meetingToCancel.guestName}</p>
            <p>
              {new Intl.DateTimeFormat('ru-RU', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
                timeZone,
              }).format(new Date(meetingToCancel.startsAt))}
              , {formatTime(meetingToCancel.startsAt, timeZone)}–
              {formatTime(meetingToCancel.endsAt, timeZone)}
            </p>
            <div className="dialog-actions">
              <button
                type="button"
                disabled={cancelling}
                onClick={() => setMeetingToCancel(null)}
              >
                Не отменять
              </button>
              <button
                type="button"
                disabled={cancelling}
                onClick={confirmCancellation}
              >
                Подтвердить отмену
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  )
}

export default OwnerMeetingsPage
