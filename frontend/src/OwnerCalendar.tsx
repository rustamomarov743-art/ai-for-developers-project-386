import { useState } from 'react'
import type { OwnerMeeting } from './api/generated/types.gen'
import { formatTime, localDateKey } from './dateTime'

const MONTHS = [
  'Январь',
  'Февраль',
  'Март',
  'Апрель',
  'Май',
  'Июнь',
  'Июль',
  'Август',
  'Сентябрь',
  'Октябрь',
  'Ноябрь',
  'Декабрь',
]

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']

type OwnerCalendarProps = {
  meetings: OwnerMeeting[]
  timeZone: string
}

function OwnerCalendar({ meetings, timeZone }: OwnerCalendarProps) {
  const today = new Date()
  const [displayedMonth, setDisplayedMonth] = useState({
    year: today.getFullYear(),
    month: today.getMonth(),
  })
  const { year, month } = displayedMonth
  const isCurrentMonth =
    year === today.getFullYear() && month === today.getMonth()
  const dayCount = new Date(year, month + 1, 0).getDate()
  const leadingEmptyDays = (new Date(year, month, 1).getDay() + 6) % 7
  const cells: (number | null)[] = [
    ...Array.from({ length: leadingEmptyDays }, () => null),
    ...Array.from({ length: dayCount }, (_, index) => index + 1),
  ]
  const weeks: (number | null)[][] = []
  for (let index = 0; index < cells.length; index += 7) {
    weeks.push(cells.slice(index, index + 7))
  }

  function changeMonth(offset: number) {
    setDisplayedMonth((current) => {
      const next = new Date(current.year, current.month + offset, 1)
      return { year: next.getFullYear(), month: next.getMonth() }
    })
  }

  return (
    <details className="owner-calendar">
      <summary>Календарь на месяц</summary>
      <div className="calendar-navigation">
        <button
          type="button"
          aria-label="Предыдущий месяц"
          disabled={isCurrentMonth}
          onClick={() => changeMonth(-1)}
        >
          ←
        </button>
        <h2>
          {MONTHS[month]} {year}
        </h2>
        <button
          type="button"
          aria-label="Следующий месяц"
          onClick={() => changeMonth(1)}
        >
          →
        </button>
      </div>
      <table>
        <thead>
          <tr>
            {WEEKDAYS.map((weekday) => (
              <th key={weekday} scope="col">
                {weekday}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((week, weekIndex) => (
            <tr key={weekIndex}>
              {week.map((day, dayIndex) => {
                if (day === null) {
                  return <td key={`empty-${dayIndex}`} className="empty-day" />
                }
                const date = new Date(year, month, day)
                const key = localDateKey(date.toISOString(), timeZone)
                const isPast = isCurrentMonth && day < today.getDate()
                const dateMeetings = isPast
                  ? []
                  : meetings.filter(
                      (meeting) =>
                        localDateKey(meeting.startsAt, timeZone) === key,
                    )
                const label = new Intl.DateTimeFormat('ru-RU', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                }).format(date)
                return (
                  <td
                    key={day}
                    aria-label={label}
                    className={isPast ? 'past-day' : undefined}
                  >
                    <span className="calendar-day-number">{day}</span>
                    {dateMeetings.map((meeting) => (
                      <div key={meeting.id} className="calendar-meeting">
                        <time>{formatTime(meeting.startsAt, timeZone)}</time>
                        <span>{meeting.meetingType.name}</span>
                      </div>
                    ))}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  )
}

export default OwnerCalendar
