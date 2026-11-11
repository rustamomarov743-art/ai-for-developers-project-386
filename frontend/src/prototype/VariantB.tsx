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

function OwnerHeaderB(props: PrototypeProps) {
  return (
    <header className="variant-b-header">
      <Link className="brand" to="/">Календарь звонков</Link>
      <nav aria-label="Разделы владельца">
        <button className={props.screen === 'owner-calendar' ? 'active' : ''} onClick={() => props.onNavigate('owner-calendar')}>Встречи</button>
        <button className={props.screen === 'owner-types' ? 'active' : ''} onClick={() => props.onNavigate('owner-types')}>Типы</button>
        <button className={props.screen === 'owner-availability' ? 'active' : ''} onClick={() => props.onNavigate('owner-availability')}>Доступность</button>
      </nav>
      <button className="prototype-button prototype-button-secondary" onClick={() => props.onNavigate('book-type')}>Страница гостя ↗</button>
    </header>
  )
}

function CalendarB(props: PrototypeProps) {
  const visibleBookings = props.dataState === 'empty' ? [] : props.bookings
  return (
    <StateMessage state={props.dataState === 'empty' ? 'content' : props.dataState} emptyText="" onRetry={props.onRetry}>
      <div className="variant-b-title"><div><span className="prototype-eyebrow">Четверг, 12 ноября</span><h1>Мои встречи</h1></div><span className="prototype-timezone">Europe/Moscow</span></div>
      <Notice>{props.notice}</Notice>
      <section className="variant-b-agenda" aria-labelledby="agenda-b">
        <div className="prototype-section-heading"><h2 id="agenda-b">Ближайшие первыми</h2><span>{visibleBookings.length} встречи</span></div>
        {visibleBookings.length === 0 ? <div className="prototype-empty">Предстоящих встреч пока нет</div> : (
          <div className="prototype-table-wrap"><table className="prototype-table"><thead><tr><th>Когда</th><th>Встреча</th><th>Гость</th><th>Статус</th><th></th></tr></thead><tbody>
            {visibleBookings.map((booking) => <tr key={booking.id}>
              <td><strong>{booking.date}</strong><br />{booking.time} · {booking.duration} мин</td>
              <td>{booking.type}</td>
              <td>{booking.guest}<br /><span>{booking.email}</span></td>
              <td>{booking.current ? <span className="prototype-badge prototype-badge-live">Идёт сейчас</span> : 'Ожидается'}</td>
              <td>{!booking.current && <button className="prototype-text-button prototype-danger-text" onClick={() => props.onRequestCancel(booking)}>Отменить</button>}</td>
            </tr>)}
          </tbody></table></div>
        )}
      </section>
      <section className="variant-b-month">
        <div className="prototype-section-heading"><h2>Ноябрь 2026</h2><div className="prototype-actions"><button className="prototype-icon-button" disabled>←</button><button className="prototype-icon-button">→</button></div></div>
        <div className="prototype-weekdays">{['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((day) => <span key={day}>{day}</span>)}</div>
        <div className="prototype-month-grid variant-b-month-grid">
          {monthDays.map((day, index) => <div className="prototype-month-day" key={`${day}-${index}`}>{day && <span className="prototype-day-number">{day}</span>}{visibleBookings.some((booking) => booking.day === day) && <span className="variant-b-event-dot">{visibleBookings.filter((booking) => booking.day === day).length} встреча</span>}</div>)}
        </div>
      </section>
    </StateMessage>
  )
}

function TypesB(props: PrototypeProps) {
  const [formOpen, setFormOpen] = useState(false)
  const visibleTypes = props.dataState === 'empty' ? [] : props.types
  return (
    <>
      <div className="variant-b-title"><div><span className="prototype-eyebrow">Настройки бронирования</span><h1>Типы встреч</h1></div><button className="prototype-button" onClick={() => setFormOpen(true)}>+ Новый тип</button></div>
      <Notice>{props.notice}</Notice>
      <StateMessage state={props.dataState} emptyText="Типы встреч пока не созданы" onRetry={props.onRetry}>
        <section className="variant-b-type-table">
          {visibleTypes.map((type, index) => <article key={type.id}><span className="variant-b-type-number">{String(index + 1).padStart(2, '0')}</span><div><h2>{type.name}</h2><p>{type.description}</p></div><strong>{type.duration}<small> минут</small></strong></article>)}
        </section>
      </StateMessage>
      {formOpen && <div className="variant-b-drawer-backdrop" onClick={() => setFormOpen(false)}>
        <form className="variant-b-drawer prototype-form" onClick={(event) => event.stopPropagation()} onSubmit={(event) => { event.preventDefault(); props.onCreateType() }}>
          <div className="prototype-section-heading"><h2>Новый тип встречи</h2><button type="button" className="prototype-icon-button" onClick={() => setFormOpen(false)} aria-label="Закрыть">×</button></div>
          <p>После создания тип сразу появится в списке.</p>
          <TypeFields draft={props.typeDraft} errors={props.typeErrors} onChange={props.onTypeDraftChange} />
          <button className="prototype-button" type="submit">Создать тип</button>
        </form>
      </div>}
    </>
  )
}

function AvailabilityB(props: PrototypeProps) {
  if (props.dataState === 'empty') return <section className="variant-b-first-run"><h1>Сначала настройте доступность</h1><p>Выберите часовой пояс и сохраните даже пустой недельный шаблон.</p><select defaultValue="Europe/Moscow" aria-label="Часовой пояс"><option>Europe/Moscow</option><option>UTC</option></select><button className="prototype-button" onClick={() => props.onDataStateChange('content')}>Создать расписание</button></section>
  return (
    <StateMessage state={props.dataState} emptyText="" onRetry={props.onRetry}>
      <div className="variant-b-title"><div><span className="prototype-eyebrow">Единый черновик</span><h1>Когда вы доступны?</h1></div><span className="prototype-timezone">{props.availability.timezone}</span></div>
      <Notice>{props.notice}</Notice>
      <p className="prototype-hint">Существующие бронирования сохранятся при любых изменениях расписания.</p>
      <div className="variant-b-availability-layout">
        <section className="variant-b-week-board">
          {props.availability.week.map((day, dayIndex) => <div className="variant-b-day-column" key={day.day}>
            <h2>{day.short}<small>{day.day}</small></h2>
            {day.intervals.length === 0 && <p className="prototype-muted">Нет доступности</p>}
            {day.intervals.map((interval) => <div className="variant-b-interval-card" key={interval.id}>
              <label>С<input aria-label={`${day.day}: начало`} type="time" value={interval.start} onChange={(event) => props.onAvailabilityChange(updateInterval(props.availability, dayIndex, interval.id, 'start', event.target.value))} /></label>
              <label>До<input aria-label={`${day.day}: окончание`} type="time" value={interval.end} onChange={(event) => props.onAvailabilityChange(updateInterval(props.availability, dayIndex, interval.id, 'end', event.target.value))} /></label>
              <button className="prototype-text-button prototype-danger-text" onClick={() => props.onAvailabilityChange(removeInterval(props.availability, dayIndex, interval.id))}>Удалить</button>
            </div>)}
            <button className="prototype-text-button" onClick={() => props.onAvailabilityChange(addInterval(props.availability, dayIndex))}>+ Добавить</button>
          </div>)}
        </section>
        <aside className="variant-b-exceptions">
          <div><h2>Особые даты</h2><p>Заменяют недельный шаблон на выбранный день.</p></div>
          {props.availability.exceptions.length === 0 && <div className="prototype-empty">Исключений нет</div>}
          {props.availability.exceptions.map((exception) => <article key={exception.id}><input aria-label="Дата исключения" type="date" value={exception.date} onChange={(event) => props.onAvailabilityChange({ ...props.availability, exceptions: props.availability.exceptions.map((item) => item.id === exception.id ? { ...item, date: event.target.value } : item) })} /><strong>{exception.closed ? 'День закрыт' : 'Особые интервалы'}</strong>{!exception.closed && <span>{exception.intervals.map((interval) => `${interval.start}–${interval.end}`).join(', ')}</span>}<button className="prototype-text-button prototype-danger-text" onClick={() => props.onAvailabilityChange({ ...props.availability, exceptions: props.availability.exceptions.filter((item) => item.id !== exception.id) })}>Удалить исключение</button></article>)}
          <button className="prototype-button prototype-button-secondary" onClick={() => props.onAvailabilityChange(addException(props.availability))}>+ Добавить дату</button>
        </aside>
      </div>
      <AvailabilityActions dirty={props.draftDirty} error={props.availabilityError} onSave={props.onSaveAvailability} onDiscard={props.onDiscardAvailability} />
    </StateMessage>
  )
}

function BookingB(props: PrototypeProps) {
  const type = selectedMeetingType(props)
  const selectedDay = guestDays.find((day) => day.date === props.selectedDate)
  const step = props.screen === 'book-type' ? 1 : props.screen === 'book-slot' ? 2 : props.screen === 'book-details' ? 3 : 4
  return (
    <div className="variant-b-booking">
      <header className="variant-b-header"><Link className="brand" to="/">Календарь звонков</Link><span className="variant-b-step-label">Шаг {step} из 4</span><Link className="owner-link" to="/">Выйти на главную</Link></header>
      <main className="variant-b-booking-main">
        <div className="variant-b-progress-line"><span style={{ width: `${step * 25}%` }} /></div>
        <Notice>{props.notice}</Notice>
        {props.screen === 'book-type' && <StateMessage state={props.dataState} emptyText="Нет доступных встреч для бронирования" onRetry={props.onRetry}>
          <section><span className="prototype-eyebrow">Бронирование без регистрации</span><h1>Выберите формат разговора</h1><div className="variant-b-booking-type-list">
            {props.types.map((meetingType) => <button key={meetingType.id} onClick={() => props.onSelectType(meetingType.id)}><span className="variant-b-duration">{meetingType.duration}<small>мин</small></span><span><strong>{meetingType.name}</strong><small>{meetingType.description}</small></span><b>Выбрать →</b></button>)}
          </div></section>
        </StateMessage>}
        {props.screen === 'book-slot' && <StateMessage state={props.dataState === 'empty' ? 'content' : props.dataState} emptyText="" onRetry={props.onRetry}>
          <section><button className="prototype-text-button" onClick={() => props.onNavigate('book-type')}>← {type?.name}</button><div className="variant-b-title"><div><h1>Найдите удобное время</h1><p>Europe/Moscow · длительность {type?.duration} минут</p></div></div>
            <div className="variant-b-date-ribbon">{guestDays.map((day) => <button key={day.date} disabled={day.disabled || props.dataState === 'empty'} className={props.selectedDate === day.date ? 'active' : ''} onClick={() => props.onSelectDate(day.date)}><span>{day.short.split(' ')[0]}</span><strong>{day.short.split(' ')[1]}</strong></button>)}</div>
            <div className="variant-b-slots"><div className="prototype-section-heading"><h2>{selectedDay?.label ?? 'Выберите дату'}</h2><span>Свободные начала</span></div>
              {props.selectedDate ? <><div className="variant-b-slot-row">{freeSlots.map((slot) => <button key={slot} className={props.selectedSlot === slot ? 'active' : ''} onClick={() => props.onSelectSlot(slot)}>{slot}<small>{type?.duration} мин</small></button>)}</div><div className="variant-b-busy-timeline"><span>Занято:</span>{busySlots.map((slot) => <button disabled key={slot.start}>{slot.start}–{slot.end}</button>)}</div></> : <div className="prototype-empty">Выберите доступный день на ленте выше</div>}
            </div>
          </section>
        </StateMessage>}
        {props.screen === 'book-details' && <section><button className="prototype-text-button" onClick={() => props.onNavigate('book-slot')}>← Изменить время</button><h1>Осталось представиться</h1><div className="variant-b-summary-band"><BookingSummary type={type} date={selectedDay?.label ?? props.selectedDate} slot={props.selectedSlot} /><button className="prototype-text-button" onClick={() => props.onNavigate('book-type')}>Изменить тип встречи</button></div>
          <form className="variant-b-guest-form prototype-form" onSubmit={(event) => { event.preventDefault(); props.onBook() }}><GuestFields guest={props.guest} errors={props.guestErrors} onChange={props.onGuestChange} /><div className="prototype-actions"><button className="prototype-button" type="submit">Забронировать встречу</button><button className="prototype-text-button" type="button" onClick={props.onSimulateConflict}>Имитировать конфликт слота</button></div></form>
        </section>}
        {props.screen === 'book-success' && <section className="variant-b-success"><div><span className="prototype-eyebrow">Готово</span><h1>Встреча забронирована</h1><p>Можно закрыть страницу или выбрать другое время.</p><div className="prototype-actions"><button className="prototype-button" onClick={props.onRestart}>Ещё одна встреча</button><Link className="prototype-button prototype-button-secondary" to="/">На главную</Link></div></div><BookingSummary type={type} date={selectedDay?.label ?? props.selectedDate} slot={props.selectedSlot} /></section>}
      </main>
    </div>
  )
}

export function VariantB(props: PrototypeProps) {
  const isOwner = props.screen.startsWith('owner-')
  return <div className="variant-b prototype-variant">
    {isOwner ? <><OwnerHeaderB {...props} /><main className="variant-b-main">{props.screen === 'owner-calendar' && <CalendarB {...props} />}{props.screen === 'owner-types' && <TypesB {...props} />}{props.screen === 'owner-availability' && <AvailabilityB {...props} />}</main></> : <BookingB {...props} />}
    <CancelDialog booking={props.cancelBooking} onConfirm={props.onConfirmCancel} onClose={props.onCloseCancel} />
  </div>
}
