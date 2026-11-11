import type { ReactNode } from 'react'
import type {
  Booking,
  DataState,
  GuestDraft,
  MeetingType,
  TypeDraft,
} from './model'

export function StateMessage({
  state,
  emptyText,
  onRetry,
  children,
}: {
  state: DataState
  emptyText: string
  onRetry: () => void
  children: ReactNode
}) {
  if (state === 'loading') {
    return (
      <div className="prototype-status" role="status">
        <span className="prototype-spinner" aria-hidden="true" />
        Загружаем данные…
      </div>
    )
  }

  if (state === 'error') {
    return (
      <div className="prototype-alert prototype-alert-error" role="alert">
        <strong>Не удалось загрузить данные</strong>
        <p>Проверьте соединение и попробуйте ещё раз.</p>
        <button className="prototype-button prototype-button-secondary" onClick={onRetry}>
          Повторить
        </button>
      </div>
    )
  }

  if (state === 'empty') {
    return <div className="prototype-empty">{emptyText}</div>
  }

  return children
}

export function Notice({ children }: { children: ReactNode }) {
  if (!children) return null
  return (
    <div className="prototype-alert prototype-alert-success" role="status">
      {children}
    </div>
  )
}

export function TypeFields({
  draft,
  errors,
  onChange,
}: {
  draft: TypeDraft
  errors: Partial<TypeDraft>
  onChange: (field: keyof TypeDraft, value: string) => void
}) {
  return (
    <>
      <label className="prototype-field">
        <span>Название</span>
        <input
          value={draft.name}
          maxLength={100}
          onChange={(event) => onChange('name', event.target.value)}
          placeholder="Например, Консультация"
        />
        {errors.name && <small className="prototype-field-error">{errors.name}</small>}
      </label>
      <label className="prototype-field">
        <span>Описание</span>
        <textarea
          value={draft.description}
          maxLength={1000}
          rows={4}
          onChange={(event) => onChange('description', event.target.value)}
          placeholder="Что гость получит от встречи"
        />
        {errors.description && (
          <small className="prototype-field-error">{errors.description}</small>
        )}
      </label>
      <label className="prototype-field">
        <span>Длительность, минут</span>
        <input
          type="number"
          min={1}
          max={1440}
          value={draft.duration}
          onChange={(event) => onChange('duration', event.target.value)}
        />
        {errors.duration && <small className="prototype-field-error">{errors.duration}</small>}
      </label>
    </>
  )
}

export function GuestFields({
  guest,
  errors,
  onChange,
}: {
  guest: GuestDraft
  errors: Partial<GuestDraft>
  onChange: (field: keyof GuestDraft, value: string) => void
}) {
  return (
    <>
      <label className="prototype-field">
        <span>Ваше имя</span>
        <input
          value={guest.name}
          maxLength={100}
          onChange={(event) => onChange('name', event.target.value)}
          placeholder="Иван Иванов"
        />
        {errors.name && <small className="prototype-field-error">{errors.name}</small>}
      </label>
      <label className="prototype-field">
        <span>Email</span>
        <input
          type="email"
          value={guest.email}
          maxLength={254}
          onChange={(event) => onChange('email', event.target.value)}
          placeholder="ivan@example.com"
        />
        {errors.email && <small className="prototype-field-error">{errors.email}</small>}
      </label>
    </>
  )
}

export function BookingSummary({
  type,
  date,
  slot,
  timezone = 'Europe/Moscow',
}: {
  type: MeetingType | undefined
  date: string | null
  slot: string | null
  timezone?: string
}) {
  return (
    <dl className="prototype-summary">
      <div>
        <dt>Тип встречи</dt>
        <dd>{type?.name ?? 'Не выбран'}</dd>
      </div>
      <div>
        <dt>Дата и время</dt>
        <dd>{date && slot ? `${date}, ${slot}` : 'Не выбраны'}</dd>
      </div>
      <div>
        <dt>Длительность</dt>
        <dd>{type ? `${type.duration} минут` : '—'}</dd>
      </div>
      <div>
        <dt>Часовой пояс</dt>
        <dd>{timezone}</dd>
      </div>
    </dl>
  )
}

export function AvailabilityActions({
  dirty,
  error,
  onSave,
  onDiscard,
}: {
  dirty: boolean
  error: string
  onSave: () => void
  onDiscard: () => void
}) {
  return (
    <div className="prototype-save-bar">
      <div>
        {error && <span className="prototype-field-error">{error}</span>}
        {!error && <span>{dirty ? 'Есть несохранённые изменения' : 'Все изменения сохранены'}</span>}
      </div>
      <div className="prototype-actions">
        <button
          className="prototype-button prototype-button-secondary"
          disabled={!dirty}
          onClick={onDiscard}
        >
          Отменить изменения
        </button>
        <button className="prototype-button" disabled={!dirty} onClick={onSave}>
          Сохранить
        </button>
      </div>
    </div>
  )
}

export function CancelDialog({
  booking,
  onConfirm,
  onClose,
}: {
  booking: Booking | null
  onConfirm: () => void
  onClose: () => void
}) {
  if (!booking) return null

  return (
    <div className="prototype-modal-backdrop">
      <section className="prototype-modal" role="dialog" aria-modal="true" aria-labelledby="cancel-title">
        <h2 id="cancel-title">Отменить встречу?</h2>
        <p>
          {booking.type} с гостем {booking.guest}, {booking.date} в {booking.time}.
        </p>
        <p>Освободившееся время снова станет доступно для бронирования.</p>
        <div className="prototype-actions">
          <button className="prototype-button prototype-button-secondary" onClick={onClose}>
            Оставить встречу
          </button>
          <button className="prototype-button prototype-button-danger" onClick={onConfirm}>
            Отменить встречу
          </button>
        </div>
      </section>
    </div>
  )
}

