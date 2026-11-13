import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import {
  createBooking,
  getBookingAvailability,
  listBookingMeetingTypes,
} from './api/generated/sdk.gen'
import type {
  BookingAvailability,
  BookingSlot,
  Meeting,
  MeetingType,
} from './api/generated/types.gen'

function guestTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat('ru-RU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00Z`))
}

function formatTime(instant: string, timeZone: string) {
  return new Intl.DateTimeFormat('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone,
  }).format(new Date(instant))
}

function MeetingSummary({
  meetingType,
  date,
  startsAt,
  endsAt,
  timeZone,
}: {
  meetingType: MeetingType
  date: string
  startsAt: string
  endsAt: string
  timeZone: string
}) {
  return (
    <section className="booking-summary" aria-labelledby="booking-summary-title">
      <h2 id="booking-summary-title">Сводка встречи</h2>
      <dl>
        <dt>Тип встречи</dt>
        <dd>{meetingType.name}</dd>
        <dt>Дата</dt>
        <dd>{formatDate(date)}</dd>
        <dt>Время</dt>
        <dd>
          {formatTime(startsAt, timeZone)}–{formatTime(endsAt, timeZone)}
        </dd>
        <dt>Длительность</dt>
        <dd>{meetingType.durationMinutes} мин</dd>
        <dt>Часовой пояс</dt>
        <dd>{timeZone}</dd>
      </dl>
    </section>
  )
}

function BookingPage() {
  const [timeZone] = useState(guestTimeZone)
  const [meetingTypes, setMeetingTypes] = useState<MeetingType[]>([])
  const [loading, setLoading] = useState(true)
  const [loadFailed, setLoadFailed] = useState(false)
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [selectedType, setSelectedType] = useState<MeetingType | null>(null)
  const [availability, setAvailability] = useState<BookingAvailability | null>(null)
  const [availabilityLoading, setAvailabilityLoading] = useState(false)
  const [availabilityFailed, setAvailabilityFailed] = useState(false)
  const [availabilityAttempt, setAvailabilityAttempt] = useState(0)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [selectedSlot, setSelectedSlot] = useState<BookingSlot | null>(null)
  const [guestName, setGuestName] = useState('')
  const [guestEmail, setGuestEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [bookingError, setBookingError] = useState<string | null>(null)
  const [conflictMessage, setConflictMessage] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<{
    guestName?: string
    guestEmail?: string
  }>({})
  const [bookedMeeting, setBookedMeeting] = useState<Meeting | null>(null)
  const [bookedDate, setBookedDate] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    listBookingMeetingTypes({ query: { timeZone } })
      .then(({ data, response }) => {
        if (!active) return
        if (response.ok && data) {
          setMeetingTypes(data)
        } else {
          setLoadFailed(true)
        }
        setLoading(false)
      })
      .catch(() => {
        if (!active) return
        setLoadFailed(true)
        setLoading(false)
      })
    return () => {
      active = false
    }
  }, [loadAttempt, timeZone])

  useEffect(() => {
    if (!selectedType) return
    let active = true
    getBookingAvailability({
      path: { id: selectedType.id },
      query: { timeZone },
    })
      .then(({ data, response }) => {
        if (!active) return
        if (response.ok && data) {
          setAvailability(data)
          setSelectedDate(
            data.days.find((day) => day.hasAvailableSlots)?.date ?? null,
          )
        } else {
          setAvailabilityFailed(true)
        }
        setAvailabilityLoading(false)
      })
      .catch(() => {
        if (!active) return
        setAvailabilityFailed(true)
        setAvailabilityLoading(false)
      })
    return () => {
      active = false
    }
  }, [availabilityAttempt, selectedType, timeZone])

  function selectType(meetingType: MeetingType) {
    setConflictMessage(null)
    setSelectedType(meetingType)
    setAvailability(null)
    setAvailabilityLoading(true)
    setAvailabilityFailed(false)
    setAvailabilityAttempt(0)
    setSelectedDate(null)
    setSelectedSlot(null)
  }

  function startAnotherBooking() {
    setBookedMeeting(null)
    setBookedDate(null)
    setMeetingTypes([])
    setSelectedType(null)
    setAvailability(null)
    setSelectedDate(null)
    setSelectedSlot(null)
    setGuestName('')
    setGuestEmail('')
    setFieldErrors({})
    setBookingError(null)
    setConflictMessage(null)
    setLoading(true)
    setLoadFailed(false)
    setLoadAttempt((value) => value + 1)
  }

  function returnToSlots() {
    setSelectedSlot(null)
    setSelectedDate(null)
    setAvailability(null)
    setAvailabilityLoading(true)
    setAvailabilityFailed(false)
    setBookingError(null)
    setConflictMessage(null)
    setFieldErrors({})
    setAvailabilityAttempt((value) => value + 1)
  }

  function returnToTypes() {
    setConflictMessage(null)
    setSelectedType(null)
    setAvailability(null)
    setAvailabilityFailed(false)
    setSelectedDate(null)
    setSelectedSlot(null)
  }

  const selectedDay = availability?.days.find((day) => day.date === selectedDate)

  async function submitBooking(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedType || !selectedDate || !selectedSlot || submitting) return
    const trimmedName = guestName.trim()
    const trimmedEmail = guestEmail.trim()
    const errors: { guestName?: string; guestEmail?: string } = {}
    if (!trimmedName) {
      errors.guestName = 'Имя обязательно'
    } else if (trimmedName.length > 100) {
      errors.guestName = 'Имя должно содержать не более 100 символов'
    }
    if (!trimmedEmail) {
      errors.guestEmail = 'Email обязателен'
    } else if (trimmedEmail.length > 254) {
      errors.guestEmail = 'Email должен содержать не более 254 символов'
    } else {
      const at = trimmedEmail.indexOf('@')
      if (
        at <= 0 ||
        at !== trimmedEmail.lastIndexOf('@') ||
        at === trimmedEmail.length - 1 ||
        /\s/.test(trimmedEmail)
      ) {
        errors.guestEmail = 'Укажите корректный email'
      }
    }
    setFieldErrors(errors)
    setBookingError(null)
    if (Object.keys(errors).length > 0) return

    setSubmitting(true)
    try {
      const { data, error, response } = await createBooking({
        body: {
          meetingTypeId: selectedType.id,
          startsAt: selectedSlot.startsAt,
          guestName: trimmedName,
          guestEmail: trimmedEmail,
        },
      })
      if (response.ok && data) {
        setConflictMessage(null)
        setBookedMeeting(data)
        setBookedDate(selectedDate)
      } else if (response.status === 400 && error?.code === 'VALIDATION_ERROR') {
        const serverErrors: { guestName?: string; guestEmail?: string } = {}
        for (const fieldError of error.errors ?? []) {
          if (fieldError.path === 'guestName') serverErrors.guestName = fieldError.message
          if (fieldError.path === 'guestEmail') serverErrors.guestEmail = fieldError.message
        }
        setFieldErrors(serverErrors)
        if (Object.keys(serverErrors).length === 0) {
          setBookingError('Не удалось забронировать встречу. Попробуйте ещё раз')
        }
      } else if (response.status === 409 && error?.code === 'SLOT_UNAVAILABLE') {
        await refreshAfterConflict(selectedType)
      } else {
        setBookingError('Не удалось забронировать встречу. Попробуйте ещё раз')
      }
    } catch {
      setBookingError('Не удалось забронировать встречу. Попробуйте ещё раз')
    } finally {
      setSubmitting(false)
    }
  }

  async function refreshAfterConflict(meetingType: MeetingType) {
    setSelectedSlot(null)
    setSelectedDate(null)
    setAvailability(null)
    setFieldErrors({})
    setAvailabilityFailed(false)
    setAvailabilityLoading(true)
    try {
      const { data, response } = await getBookingAvailability({
        path: { id: meetingType.id },
        query: { timeZone },
      })
      if (!response.ok || !data) throw new Error('availability')
      if (data.days.some((day) => day.hasAvailableSlots)) {
        setAvailability(data)
        setSelectedDate(data.days.find((day) => day.hasAvailableSlots)?.date ?? null)
        setConflictMessage('Выбранное время недоступно. Выберите другое время')
        return
      }

      const typesResult = await listBookingMeetingTypes({ query: { timeZone } })
      if (!typesResult.response.ok || !typesResult.data) {
        throw new Error('meeting types')
      }
      setMeetingTypes(typesResult.data.filter((candidate) => candidate.id !== meetingType.id))
      setSelectedType(null)
      setAvailability(null)
      setSelectedDate(null)
      setLoading(false)
      setLoadFailed(false)
      setConflictMessage('Выбранное время недоступно. Выберите другую встречу')
    } catch {
      setAvailabilityFailed(true)
      setBookingError('Не удалось загрузить доступность')
    } finally {
      setAvailabilityLoading(false)
    }
  }

  if (bookedMeeting && bookedDate) {
    return (
      <main className="booking-page">
        <Link className="booking-home-link" to="/">
          Календарь звонков
        </Link>
        <h1>Встреча забронирована</h1>
        <MeetingSummary
          meetingType={bookedMeeting.meetingType}
          date={bookedDate}
          startsAt={bookedMeeting.startsAt}
          endsAt={bookedMeeting.endsAt}
          timeZone={timeZone}
        />
        <button type="button" onClick={startAnotherBooking}>
          Забронировать ещё одну встречу
        </button>
        <Link to="/">На главную</Link>
      </main>
    )
  }

  return (
    <main className="booking-page">
      <Link className="booking-home-link" to="/">
        Календарь звонков
      </Link>
      <h1>Бронирование встречи</h1>
      <p className="booking-time-zone">Часовой пояс: {timeZone}</p>
      {conflictMessage && <p role="alert">{conflictMessage}</p>}
      {!selectedType && loading && <p role="status">Загрузка…</p>}
      {!selectedType && loadFailed && (
        <div role="alert">
          <p>Не удалось загрузить доступные встречи</p>
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
      {!selectedType && !loading && !loadFailed && meetingTypes.length === 0 && (
        <p>Нет доступных встреч для бронирования</p>
      )}
      {!selectedType && !loading && !loadFailed && meetingTypes.length > 0 && (
        <section aria-labelledby="booking-types-title">
          <h2 id="booking-types-title">Выберите тип встречи</h2>
          <div className="booking-types">
            {meetingTypes.map((meetingType) => (
              <button
                type="button"
                key={meetingType.id}
                onClick={() => selectType(meetingType)}
              >
                <strong>{meetingType.name}</strong>
                <span>{meetingType.description}</span>
                <span>{meetingType.durationMinutes} мин</span>
              </button>
            ))}
          </div>
        </section>
      )}
      {selectedType && (
        <section aria-labelledby="booking-calendar-title">
          <button type="button" className="booking-back" onClick={returnToTypes}>
            Выбрать другой тип
          </button>
          <h2 id="booking-calendar-title">{selectedType.name}</h2>
          <p>{selectedType.durationMinutes} мин</p>
          {availabilityLoading && <p role="status">Загрузка…</p>}
          {availabilityFailed && (
            <div role="alert">
              <p>Не удалось загрузить доступность</p>
              <button
                type="button"
                onClick={() => {
                  setAvailabilityLoading(true)
                  setAvailabilityFailed(false)
                  setAvailabilityAttempt((value) => value + 1)
                }}
              >
                Повторить
              </button>
            </div>
          )}
          {availability && !availabilityFailed && (
            <>
              <div className="booking-dates" aria-label="Даты встречи">
                {availability.days.map((day) => (
                  <button
                    type="button"
                    key={day.date}
                    aria-label={formatDate(day.date)}
                    aria-pressed={selectedDate === day.date}
                    disabled={!day.hasAvailableSlots}
                    onClick={() => {
                      setSelectedDate(day.date)
                      setSelectedSlot(null)
                    }}
                  >
                    {formatDate(day.date)}
                  </button>
                ))}
              </div>
              {!selectedDay && <p>Для этой встречи нет свободных слотов</p>}
              {selectedDay && (
                <div className="booking-day">
                  <h3>{formatDate(selectedDay.date)}</h3>
                  <ul className="booking-slots" aria-label="Время встречи">
                    {selectedDay.slots.map((slot) => (
                      <li key={slot.startsAt}>
                        <button
                          type="button"
                          disabled={slot.status === 'TOO_SOON'}
                          title={
                            slot.status === 'TOO_SOON'
                              ? 'Доступно не ранее чем за 15 минут'
                              : undefined
                          }
                          aria-pressed={selectedSlot?.startsAt === slot.startsAt}
                          onClick={() => setSelectedSlot(slot)}
                        >
                          {formatTime(slot.startsAt, timeZone)}
                        </button>
                        {slot.status === 'TOO_SOON' && <span>Слишком близко</span>}
                      </li>
                    ))}
                  </ul>
                  {selectedDay.busyIntervals.length > 0 && (
                    <ul className="booking-busy" aria-label="Занятые интервалы">
                      {selectedDay.busyIntervals.map((interval) => (
                        <li key={interval.startsAt}>
                          Занято: {formatTime(interval.startsAt, timeZone)}–
                          {formatTime(interval.endsAt, timeZone)}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
              {selectedSlot && selectedDate && (
                <p className="booking-selection" role="status">
                  Выбрано: {formatDate(selectedDate)},{' '}
                  {formatTime(selectedSlot.startsAt, timeZone)} ({timeZone})
                </p>
              )}
            </>
          )}
        </section>
      )}
      {selectedType && selectedDate && selectedSlot && (
        <>
          <MeetingSummary
            meetingType={selectedType}
            date={selectedDate}
            startsAt={selectedSlot.startsAt}
            endsAt={selectedSlot.endsAt}
            timeZone={timeZone}
          />
          <button type="button" className="booking-back" onClick={returnToSlots}>
            Изменить время
          </button>
          {bookingError && <p role="alert">{bookingError}</p>}
          <form className="booking-guest-form" noValidate onSubmit={submitBooking}>
            <label htmlFor="guest-name">Имя</label>
            <input
              id="guest-name"
              value={guestName}
              aria-invalid={Boolean(fieldErrors.guestName)}
              aria-describedby={fieldErrors.guestName ? 'guest-name-error' : undefined}
              onChange={(event) => setGuestName(event.target.value)}
            />
            {fieldErrors.guestName && (
              <p className="field-error" id="guest-name-error">
                {fieldErrors.guestName}
              </p>
            )}
            <label htmlFor="guest-email">Email</label>
            <input
              id="guest-email"
              type="email"
              value={guestEmail}
              aria-invalid={Boolean(fieldErrors.guestEmail)}
              aria-describedby={fieldErrors.guestEmail ? 'guest-email-error' : undefined}
              onChange={(event) => setGuestEmail(event.target.value)}
            />
            {fieldErrors.guestEmail && (
              <p className="field-error" id="guest-email-error">
                {fieldErrors.guestEmail}
              </p>
            )}
            <button type="submit" disabled={submitting}>
              Забронировать
            </button>
          </form>
        </>
      )}
    </main>
  )
}

export default BookingPage
