import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  addException,
  addInterval,
  busySlots,
  freeSlots,
  guestDays,
  monthDays,
  removeInterval,
  selectedMeetingType,
  updateInterval,
  type PrototypeProps,
  type Screen,
} from './model'
import {
  AvailabilityActions,
  BookingSummary,
  CancelDialog,
  GuestFields,
  Notice,
  StateMessage,
  TypeFields,
} from './PrototypeShared'

const ownerLinks: Array<{ screen: Screen; label: string }> = [
  { screen: 'owner-calendar', label: 'Календарь' },
  { screen: 'owner-types', label: 'Типы встреч' },
  { screen: 'owner-availability', label: 'Доступность' },
]

function OwnerNavigation({ screen, onNavigate }: Pick<PrototypeProps, 'screen' | 'onNavigate'>) {
  return (
    <aside className="variant-a-sidebar">
      <Link className="brand" to="/">Календарь звонков</Link>
      <span className="prototype-eyebrow">Владелец</span>
      <nav aria-label="Разделы владельца">
        {ownerLinks.map((link) => (
          <button
            key={link.screen}
            className={screen === link.screen ? 'active' : ''}
            onClick={() => onNavigate(link.screen)}
          >
            {link.label}
          </button>
        ))}
      </nav>
      <Link className="prototype-muted-link" to="/">На главную</Link>
    </aside>
  )
}

function CalendarA(props: PrototypeProps) {
  const [monthOffset, setMonthOffset] = useState(0)
  const visibleBookings = props.dataState === 'empty' || monthOffset !== 0 ? [] : props.bookings

  return (
    <StateMessage state={props.dataState === 'empty' ? 'content' : props.dataState} emptyText="" onRetry={props.onRetry}>
      <div className="prototype-page-heading">
        <div>
          <span className="prototype-eyebrow">Расписание</span>
          <h1>Предстоящие встречи</h1>
        </div>
        <span className="prototype-timezone">Europe/Moscow</span>
      </div>
      <Notice>{props.notice}</Notice>
      <div className="variant-a-calendar-layout">
        <section className="prototype-panel prototype-month-panel" aria-labelledby="month-a">
          <div className="prototype-section-heading">
            <h2 id="month-a">{monthOffset === 0 ? 'Ноябрь 2026' : 'Декабрь 2026'}</h2>
            <div className="prototype-actions">
              <button className="prototype-icon-button" disabled={monthOffset === 0} onClick={() => setMonthOffset(0)} aria-label="Предыдущий месяц">←</button>
              <button className="prototype-icon-button" disabled={monthOffset === 1} onClick={() => setMonthOffset(1)} aria-label="Следующий месяц">→</button>
            </div>
          </div>
          <div className="prototype-weekdays">
            {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((day) => <span key={day}>{day}</span>)}
          </div>
          <div className="prototype-month-grid">
            {monthDays.map((day, index) => (
              <div className="prototype-month-day" key={`${day}-${index}`}>
                {day && <span className="prototype-day-number">{day}</span>}
                {visibleBookings.filter((booking) => booking.day === day).map((booking) => (
                  <div className="prototype-calendar-event" key={booking.id}>
                    <strong>{booking.time}</strong> {booking.type}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </section>
        <section className="prototype-panel" aria-labelledby="agenda-a">
          <div className="prototype-section-heading">
            <h2 id="agenda-a">Все предстоящие</h2>
            <span className="prototype-badge">{visibleBookings.length}</span>
          </div>
          {visibleBookings.length === 0 ? (
            <div className="prototype-empty">Предстоящих встреч пока нет</div>
          ) : (
            <div className="prototype-agenda-list">
              {visibleBookings.map((booking) => (
                <article className="prototype-agenda-item" key={booking.id}>
                  <div>
                    <div className="prototype-item-title">
                      <h3>{booking.type}</h3>
                      {booking.current && <span className="prototype-badge prototype-badge-live">Идёт сейчас</span>}
                    </div>
                    <p>{booking.date}, {booking.time} · {booking.duration} мин</p>
                    <p>{booking.guest}<br /><span>{booking.email}</span></p>
                  </div>
                  {!booking.current && (
                    <button className="prototype-text-button prototype-danger-text" onClick={() => props.onRequestCancel(booking)}>Отменить</button>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </StateMessage>
  )
}

function TypesA(props: PrototypeProps) {
  const visibleTypes = props.dataState === 'empty' ? [] : props.types
  return (
    <>
      <div className="prototype-page-heading">
        <div>
          <span className="prototype-eyebrow">Форматы встреч</span>
          <h1>Типы встреч</h1>
        </div>
      </div>
      <Notice>{props.notice}</Notice>
      <div className="variant-a-types-layout">
        <section className="prototype-panel">
          <h2>Созданные типы</h2>
          <StateMessage state={props.dataState} emptyText="Типы встреч пока не созданы" onRetry={props.onRetry}>
            <div className="prototype-type-list">
              {visibleTypes.map((type) => (
                <article className="prototype-type-row" key={type.id}>
                  <div>
                    <h3>{type.name}</h3>
                    <p>{type.description}</p>
                  </div>
                  <strong>{type.duration} мин</strong>
                </article>
              ))}
            </div>
          </StateMessage>
        </section>
        <form className="prototype-panel prototype-form" onSubmit={(event) => { event.preventDefault(); props.onCreateType() }}>
          <h2>Новый тип встречи</h2>
          <TypeFields draft={props.typeDraft} errors={props.typeErrors} onChange={props.onTypeDraftChange} />
          <button className="prototype-button" type="submit">Создать тип</button>
        </form>
      </div>
    </>
  )
}

function AvailabilityA(props: PrototypeProps) {
  if (props.dataState === 'empty') {
    return (
      <div className="prototype-panel prototype-first-run">
        <span className="prototype-eyebrow">Первичная настройка</span>
        <h1>Создайте расписание</h1>
        <p>Задайте часовой пояс, затем добавьте недельные интервалы. Исключения станут доступны после сохранения.</p>
        <label className="prototype-field">
          <span>Часовой пояс</span>
          <select defaultValue="Europe/Moscow"><option>Europe/Moscow</option><option>UTC</option></select>
        </label>
        <button className="prototype-button" onClick={() => props.onDataStateChange('content')}>Создать расписание</button>
      </div>
    )
  }

  return (
    <StateMessage state={props.dataState} emptyText="" onRetry={props.onRetry}>
      <div className="prototype-page-heading">
        <div><span className="prototype-eyebrow">Рабочее время</span><h1>Доступность</h1></div>
        <span className="prototype-timezone">{props.availability.timezone}</span>
      </div>
      <Notice>{props.notice}</Notice>
      <p className="prototype-hint">Изменение доступности не отменяет и не переносит существующие бронирования.</p>
      <section className="prototype-panel">
        <div className="prototype-section-heading"><h2>Недельный шаблон</h2><span>Время: {props.availability.timezone}</span></div>
        <div className="variant-a-week">
          {props.availability.week.map((day, dayIndex) => (
            <div className="variant-a-week-row" key={day.day}>
              <strong>{day.day}</strong>
              <div className="prototype-intervals">
                {day.intervals.length === 0 && <span className="prototype-muted">Интервалы не заданы</span>}
                {day.intervals.map((interval) => (
                  <div className="prototype-interval" key={interval.id}>
                    <input aria-label={`${day.day}: начало`} type="time" value={interval.start} onChange={(event) => props.onAvailabilityChange(updateInterval(props.availability, dayIndex, interval.id, 'start', event.target.value))} />
                    <span>—</span>
                    <input aria-label={`${day.day}: окончание`} type="time" value={interval.end} onChange={(event) => props.onAvailabilityChange(updateInterval(props.availability, dayIndex, interval.id, 'end', event.target.value))} />
                    <button className="prototype-icon-button" aria-label="Удалить интервал" onClick={() => props.onAvailabilityChange(removeInterval(props.availability, dayIndex, interval.id))}>×</button>
                  </div>
                ))}
              </div>
              <button className="prototype-text-button" onClick={() => props.onAvailabilityChange(addInterval(props.availability, dayIndex))}>+ Интервал</button>
            </div>
          ))}
        </div>
      </section>
      <section className="prototype-panel">
        <div className="prototype-section-heading"><h2>Исключения</h2><button className="prototype-button prototype-button-secondary" onClick={() => props.onAvailabilityChange(addException(props.availability))}>Добавить дату</button></div>
        {props.availability.exceptions.length === 0 ? <div className="prototype-empty">Исключений нет</div> : props.availability.exceptions.map((exception) => (
          <div className="prototype-exception-row" key={exception.id}>
            <input aria-label="Дата исключения" type="date" value={exception.date} onChange={(event) => props.onAvailabilityChange({ ...props.availability, exceptions: props.availability.exceptions.map((item) => item.id === exception.id ? { ...item, date: event.target.value } : item) })} />
            <span>{exception.closed ? 'День закрыт' : exception.intervals.map((interval) => `${interval.start}–${interval.end}`).join(', ')}</span>
            <button className="prototype-text-button prototype-danger-text" onClick={() => props.onAvailabilityChange({ ...props.availability, exceptions: props.availability.exceptions.filter((item) => item.id !== exception.id) })}>Удалить исключение</button>
          </div>
        ))}
      </section>
      <AvailabilityActions dirty={props.draftDirty} error={props.availabilityError} onSave={props.onSaveAvailability} onDiscard={props.onDiscardAvailability} />
    </StateMessage>
  )
}

function BookingProgress({ step }: { step: number }) {
  return (
    <ol className="variant-a-progress">
      {['Тип встречи', 'Дата и время', 'Ваши данные', 'Готово'].map((label, index) => (
        <li key={label} className={index + 1 <= step ? 'active' : ''}><span>{index + 1}</span>{label}</li>
      ))}
    </ol>
  )
}

function BookingA(props: PrototypeProps) {
  const type = selectedMeetingType(props)
  const step = props.screen === 'book-type' ? 1 : props.screen === 'book-slot' ? 2 : props.screen === 'book-details' ? 3 : 4
  const selectedDay = guestDays.find((day) => day.date === props.selectedDate)

  return (
    <div className="variant-a-booking">
      <header className="site-header"><Link className="brand" to="/">Календарь звонков</Link><Link className="owner-link" to="/">На главную</Link></header>
      <main className="variant-a-booking-main">
        <BookingProgress step={step} />
        <Notice>{props.notice}</Notice>
        {props.screen === 'book-type' && (
          <StateMessage state={props.dataState} emptyText="Нет доступных встреч для бронирования" onRetry={props.onRetry}>
            <section className="prototype-booking-section">
              <span className="prototype-eyebrow">Шаг 1</span><h1>Что хотите обсудить?</h1><p>Выберите подходящий тип встречи.</p>
              <div className="prototype-booking-types">
                {props.types.map((meetingType) => (
                  <button key={meetingType.id} onClick={() => props.onSelectType(meetingType.id)}>
                    <span><strong>{meetingType.name}</strong><small>{meetingType.description}</small></span><b>{meetingType.duration} мин →</b>
                  </button>
                ))}
              </div>
            </section>
          </StateMessage>
        )}
        {props.screen === 'book-slot' && (
          <StateMessage state={props.dataState === 'empty' ? 'content' : props.dataState} emptyText="" onRetry={props.onRetry}>
            <section className="prototype-booking-section">
              <button className="prototype-text-button" onClick={() => props.onNavigate('book-type')}>← Другой тип встречи</button>
              <h1>{type?.name}</h1><p>{type?.duration} минут · Europe/Moscow</p>
              <div className="variant-a-slot-layout">
                <div className="prototype-panel">
                  <h2>Ближайшие 14 дней</h2>
                  <div className="variant-a-date-list">
                    {guestDays.map((day) => <button key={day.date} disabled={day.disabled || props.dataState === 'empty'} className={props.selectedDate === day.date ? 'active' : ''} onClick={() => props.onSelectDate(day.date)}>{day.label}</button>)}
                  </div>
                </div>
                <div className="prototype-panel">
                  <h2>{selectedDay?.label ?? 'Выберите день'}</h2>
                  {props.selectedDate ? <>
                    <div className="prototype-slot-grid">
                      {freeSlots.map((slot) => <button key={slot} className={props.selectedSlot === slot ? 'active' : ''} onClick={() => props.onSelectSlot(slot)}>{slot}</button>)}
                    </div>
                    <h3>Недоступное время</h3>
                    <div className="prototype-busy-list">{busySlots.map((slot) => <button disabled key={slot.start}>{slot.start}–{slot.end} · занято</button>)}</div>
                  </> : <div className="prototype-empty">Свободные интервалы появятся здесь</div>}
                </div>
              </div>
            </section>
          </StateMessage>
        )}
        {props.screen === 'book-details' && (
          <section className="prototype-booking-section">
            <button className="prototype-text-button" onClick={() => props.onNavigate('book-slot')}>← Изменить слот</button>
            <h1>Как к вам обращаться?</h1>
            <div className="variant-a-details-layout">
              <form className="prototype-panel prototype-form" onSubmit={(event) => { event.preventDefault(); props.onBook() }}>
                <GuestFields guest={props.guest} errors={props.guestErrors} onChange={props.onGuestChange} />
                <button className="prototype-button" type="submit">Забронировать</button>
                <button className="prototype-text-button" type="button" onClick={props.onSimulateConflict}>Имитировать конфликт слота</button>
              </form>
              <aside className="prototype-panel"><h2>Ваша встреча</h2><BookingSummary type={type} date={selectedDay?.label ?? props.selectedDate} slot={props.selectedSlot} /><button className="prototype-text-button" onClick={() => props.onNavigate('book-type')}>Изменить тип</button></aside>
            </div>
          </section>
        )}
        {props.screen === 'book-success' && (
          <section className="prototype-panel prototype-success">
            <span className="prototype-success-mark">✓</span><h1>Встреча забронирована</h1><BookingSummary type={type} date={selectedDay?.label ?? props.selectedDate} slot={props.selectedSlot} />
            <div className="prototype-actions"><button className="prototype-button" onClick={props.onRestart}>Забронировать ещё одну встречу</button><Link className="prototype-button prototype-button-secondary" to="/">На главную</Link></div>
          </section>
        )}
      </main>
    </div>
  )
}

export function VariantA(props: PrototypeProps) {
  const isOwner = props.screen.startsWith('owner-')
  return (
    <div className={isOwner ? 'variant-a prototype-variant' : 'prototype-variant'}>
      {isOwner ? <><OwnerNavigation screen={props.screen} onNavigate={props.onNavigate} /><main className="variant-a-content">
        {props.screen === 'owner-calendar' && <CalendarA {...props} />}
        {props.screen === 'owner-types' && <TypesA {...props} />}
        {props.screen === 'owner-availability' && <AvailabilityA {...props} />}
      </main></> : <BookingA {...props} />}
      <CancelDialog booking={props.cancelBooking} onConfirm={props.onConfirmCancel} onClose={props.onCloseCancel} />
    </div>
  )
}
