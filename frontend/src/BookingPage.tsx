import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  getBookingAvailability,
  listBookingMeetingTypes,
} from './api/generated/sdk.gen'
import type {
  BookingAvailability,
  BookingSlot,
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
    setSelectedType(meetingType)
    setAvailability(null)
    setAvailabilityLoading(true)
    setAvailabilityFailed(false)
    setAvailabilityAttempt(0)
    setSelectedDate(null)
    setSelectedSlot(null)
  }

  function returnToTypes() {
    setSelectedType(null)
    setAvailability(null)
    setAvailabilityFailed(false)
    setSelectedDate(null)
    setSelectedSlot(null)
  }

  const selectedDay = availability?.days.find((day) => day.date === selectedDate)

  return (
    <main className="booking-page">
      <Link className="booking-home-link" to="/">
        Календарь звонков
      </Link>
      <h1>Бронирование встречи</h1>
      <p className="booking-time-zone">Часовой пояс: {timeZone}</p>
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
    </main>
  )
}

export default BookingPage
