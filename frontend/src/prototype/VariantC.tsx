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

function OwnerHeaderC(props: PrototypeProps) {
  return (
    <header className="variant-c-header">
      <div><Link className="brand" to="/">Календарь звонков</Link><span>Кабинет владельца</span></div>
      <nav aria-label="Разделы владельца">
        <button className={props.screen === 'owner-calendar' ? 'active' : ''} onClick={() => props.onNavigate('owner-calendar')}>Встречи</button>
        <button className={props.screen === 'owner-types' ? 'active' : ''} onClick={() => props.onNavigate('owner-types')}>Типы встреч</button>
        <button className={props.screen === 'owner-availability' ? 'active' : ''} onClick={() => props.onNavigate('owner-availability')}>Доступность</button>
      </nav>
    </header>
  )
}

function CalendarC(props: PrototypeProps) {
  const visibleBookings = props.dataState === 'empty' ? [] : props.bookings
  const dates = [...new Set(visibleBookings.map((booking) => booking.date))]
  return (
    <StateMessage state={props.dataState === 'empty' ? 'content' : props.dataState} emptyText="" onRetry={props.onRetry}>
      <div className="variant-c-heading"><span className="prototype-eyebrow">Расписание · Europe/Moscow</span><h1>Предстоящие встречи</h1><p>Все ближайшие встречи по порядку, без фильтров.</p></div>
      <Notice>{props.notice}</Notice>
      <details className="variant-c-calendar-disclosure">
        <summary>Показать календарь на ноябрь 2026</summary>
        <div className="prototype-section-heading"><h2>Ноябрь 2026</h2><div className="prototype-actions"><button className="prototype-icon-button" disabled>←</button><button className="prototype-icon-button">→</button></div></div>
        <div className="prototype-weekdays">{['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((day) => <span key={day}>{day}</span>)}</div>
        <div className="prototype-month-grid variant-c-month-grid">{monthDays.map((day, index) => <div className="prototype-month-day" key={`${day}-${index}`}>{day && <span className="prototype-day-number">{day}</span>}{visibleBookings.filter((booking) => booking.day === day).map((booking) => <span className="variant-c-calendar-event" key={booking.id}>{booking.time}<br />{booking.type}</span>)}</div>)}</div>
      </details>
      {visibleBookings.length === 0 ? <div className="prototype-empty">Предстоящих встреч пока нет</div> : <section className="variant-c-timeline">
        {dates.map((date) => <div className="variant-c-date-group" key={date}><h2>{date}</h2>{visibleBookings.filter((booking) => booking.date === date).map((booking) => <article key={booking.id}>
          <time>{booking.time}</time><div><div className="prototype-item-title"><h3>{booking.type}</h3>{booking.current && <span className="prototype-badge prototype-badge-live">Идёт сейчас</span>}</div><p>{booking.duration} минут</p><strong>{booking.guest}</strong><p>{booking.email}</p></div>{!booking.current && <button className="prototype-text-button prototype-danger-text" onClick={() => props.onRequestCancel(booking)}>Отменить</button>}
        </article>)}</div>)}
      </section>}
    </StateMessage>
  )
}

function TypesC(props: PrototypeProps) {
  const visibleTypes = props.dataState === 'empty' ? [] : props.types
  return (
    <>
      <div className="variant-c-heading"><span className="prototype-eyebrow">Сначала создайте формат</span><h1>Новый тип встречи</h1><p>Название, описание и длительность увидит гость.</p></div>
      <Notice>{props.notice}</Notice>
      <form className="variant-c-create-form prototype-form" onSubmit={(event) => { event.preventDefault(); props.onCreateType() }}><TypeFields draft={props.typeDraft} errors={props.typeErrors} onChange={props.onTypeDraftChange} /><button className="prototype-button" type="submit">Создать и продолжить</button></form>
      <details className="variant-c-created-types" open><summary>Созданные типы <span className="prototype-badge">{visibleTypes.length}</span></summary><StateMessage state={props.dataState} emptyText="Типы встреч пока не созданы" onRetry={props.onRetry}><div>{visibleTypes.map((type) => <article key={type.id}><div><h2>{type.name}</h2><p>{type.description}</p></div><strong>{type.duration} мин</strong></article>)}</div></StateMessage></details>
    </>
  )
}

function AvailabilityC(props: PrototypeProps) {
  if (props.dataState === 'empty') return <section className="variant-c-first-run"><span className="prototype-eyebrow">Доступность</span><h1>Начните с часового пояса</h1><p>После создания расписания вы сможете добавить недельные интервалы и особые даты.</p><label className="prototype-field"><span>Часовой пояс</span><select defaultValue="Europe/Moscow"><option>Europe/Moscow</option><option>UTC</option></select></label><button className="prototype-button" onClick={() => props.onDataStateChange('content')}>Создать расписание</button></section>
  return (
    <StateMessage state={props.dataState} emptyText="" onRetry={props.onRetry}>
      <div className="variant-c-heading"><span className="prototype-eyebrow">Время задаётся в {props.availability.timezone}</span><h1>Доступность</h1><p>Неделя и особые даты сохраняются вместе. Бронирования не изменяются.</p></div>
      <Notice>{props.notice}</Notice>
      <section className="variant-c-week"><h2>Недельный шаблон</h2>{props.availability.week.map((day, dayIndex) => <details key={day.day} open={dayIndex === 0}><summary><strong>{day.day}</strong><span>{day.intervals.length ? day.intervals.map((interval) => `${interval.start}–${interval.end}`).join(', ') : 'Интервалы не заданы'}</span></summary><div className="variant-c-day-editor">{day.intervals.map((interval) => <div className="prototype-interval" key={interval.id}><input aria-label={`${day.day}: начало`} type="time" value={interval.start} onChange={(event) => props.onAvailabilityChange(updateInterval(props.availability, dayIndex, interval.id, 'start', event.target.value))} /><span>—</span><input aria-label={`${day.day}: окончание`} type="time" value={interval.end} onChange={(event) => props.onAvailabilityChange(updateInterval(props.availability, dayIndex, interval.id, 'end', event.target.value))} /><button className="prototype-icon-button" aria-label="Удалить интервал" onClick={() => props.onAvailabilityChange(removeInterval(props.availability, dayIndex, interval.id))}>×</button></div>)}<button className="prototype-text-button" onClick={() => props.onAvailabilityChange(addInterval(props.availability, dayIndex))}>+ Добавить интервал</button></div></details>)}</section>
      <details className="variant-c-exceptions"><summary><span><strong>Исключения</strong><small>Закрытые дни и особые интервалы</small></span><span className="prototype-badge">{props.availability.exceptions.length}</span></summary><div>{props.availability.exceptions.length === 0 && <div className="prototype-empty">Исключений нет</div>}{props.availability.exceptions.map((exception) => <article key={exception.id}><input aria-label="Дата исключения" type="date" value={exception.date} onChange={(event) => props.onAvailabilityChange({ ...props.availability, exceptions: props.availability.exceptions.map((item) => item.id === exception.id ? { ...item, date: event.target.value } : item) })} /><p>{exception.closed ? 'День закрыт' : `Особые интервалы: ${exception.intervals.map((interval) => `${interval.start}–${interval.end}`).join(', ')}`}</p><button className="prototype-text-button prototype-danger-text" onClick={() => props.onAvailabilityChange({ ...props.availability, exceptions: props.availability.exceptions.filter((item) => item.id !== exception.id) })}>Удалить исключение</button></article>)}<button className="prototype-button prototype-button-secondary" onClick={() => props.onAvailabilityChange(addException(props.availability))}>Добавить дату</button></div></details>
      <AvailabilityActions dirty={props.draftDirty} error={props.availabilityError} onSave={props.onSaveAvailability} onDiscard={props.onDiscardAvailability} />
    </StateMessage>
  )
}

function BookingC(props: PrototypeProps) {
  const type = selectedMeetingType(props)
  const selectedDay = guestDays.find((day) => day.date === props.selectedDate)
  const step = props.screen === 'book-type' ? 1 : props.screen === 'book-slot' ? 2 : props.screen === 'book-details' ? 3 : 4
  return (
    <div className="variant-c-booking"><header className="variant-c-booking-header"><Link className="brand" to="/">Календарь звонков</Link><span>{step} / 4</span></header><main className="variant-c-booking-main">
      <Notice>{props.notice}</Notice>
      {props.screen === 'book-type' && <StateMessage state={props.dataState} emptyText="Нет доступных встреч для бронирования" onRetry={props.onRetry}><section><span className="prototype-eyebrow">Бронирование</span><h1>Выберите встречу</h1><p>Дальше покажем свободное время на 14 дней.</p><div className="variant-c-booking-types">{props.types.map((meetingType) => <button key={meetingType.id} onClick={() => props.onSelectType(meetingType.id)}><strong>{meetingType.name}</strong><span>{meetingType.duration} минут</span><p>{meetingType.description}</p><b>Выбрать →</b></button>)}</div></section></StateMessage>}
      {props.screen === 'book-slot' && <StateMessage state={props.dataState === 'empty' ? 'content' : props.dataState} emptyText="" onRetry={props.onRetry}><section><button className="prototype-text-button" onClick={() => props.onNavigate('book-type')}>← Назад к типам</button><span className="prototype-eyebrow">{type?.name} · {type?.duration} минут</span><h1>Когда вам удобно?</h1><p className="prototype-timezone">Время: Europe/Moscow</p>
        <label className="prototype-field variant-c-date-select"><span>День</span><select value={props.selectedDate ?? ''} onChange={(event) => props.onSelectDate(event.target.value)}><option value="" disabled>Выберите дату</option>{guestDays.map((day) => <option key={day.date} value={day.date} disabled={day.disabled || props.dataState === 'empty'}>{day.label}{day.disabled ? ' — нет слотов' : ''}</option>)}</select></label>
        {props.selectedDate ? <div className="variant-c-slot-list"><h2>Свободное время</h2>{freeSlots.map((slot) => <button key={slot} className={props.selectedSlot === slot ? 'active' : ''} onClick={() => props.onSelectSlot(slot)}><strong>{slot}</strong><span>{type?.duration} минут</span></button>)}<h2>Занято</h2>{busySlots.map((slot) => <button disabled key={slot.start}><strong>{slot.start}–{slot.end}</strong><span>Недоступно</span></button>)}</div> : <div className="prototype-empty">Сначала выберите доступный день</div>}
      </section></StateMessage>}
      {props.screen === 'book-details' && <section><button className="prototype-text-button" onClick={() => props.onNavigate('book-slot')}>← Назад ко времени</button><span className="prototype-eyebrow">Последний шаг</span><h1>Ваши данные</h1><details className="variant-c-booking-summary" open><summary>Проверьте встречу</summary><BookingSummary type={type} date={selectedDay?.label ?? props.selectedDate} slot={props.selectedSlot} /><button className="prototype-text-button" onClick={() => props.onNavigate('book-type')}>Изменить тип</button></details><form className="prototype-form" onSubmit={(event) => { event.preventDefault(); props.onBook() }}><GuestFields guest={props.guest} errors={props.guestErrors} onChange={props.onGuestChange} /><button className="prototype-button" type="submit">Забронировать</button><button className="prototype-text-button" type="button" onClick={props.onSimulateConflict}>Имитировать конфликт слота</button></form></section>}
      {props.screen === 'book-success' && <section className="variant-c-success"><span className="prototype-success-mark">✓</span><h1>Встреча забронирована</h1><p>Спасибо, {props.guest.name || 'гость'}!</p><BookingSummary type={type} date={selectedDay?.label ?? props.selectedDate} slot={props.selectedSlot} /><button className="prototype-button" onClick={props.onRestart}>Забронировать ещё одну</button><Link className="prototype-muted-link" to="/">На главную</Link></section>}
    </main></div>
  )
}

export function VariantC(props: PrototypeProps) {
  const isOwner = props.screen.startsWith('owner-')
  return <div className="variant-c prototype-variant">{isOwner ? <><OwnerHeaderC {...props} /><main className="variant-c-main">{props.screen === 'owner-calendar' && <CalendarC {...props} />}{props.screen === 'owner-types' && <TypesC {...props} />}{props.screen === 'owner-availability' && <AvailabilityC {...props} />}</main></> : <BookingC {...props} />}<CancelDialog booking={props.cancelBooking} onConfirm={props.onConfirmCancel} onClose={props.onCloseCancel} /></div>
}
