// Три варианта страниц владельца и гостя на /prototype/pages, переключаемые через ?variant=.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import './prototype.css'
import {
  initialAvailability,
  initialBookings,
  initialTypes,
  screenLabels,
  type AvailabilityDraft,
  type Booking,
  type DataState,
  type GuestDraft,
  type Interval,
  type Screen,
  type TypeDraft,
  type VariantKey,
} from './model'
import { VariantA } from './VariantA'
import { VariantB } from './VariantB'
import { VariantC } from './VariantC'

const variantNames: Record<VariantKey, string> = {
  A: 'Рабочее пространство',
  B: 'Фокус на задаче',
  C: 'Одна колонка',
}

const variantKeys = Object.keys(variantNames) as VariantKey[]

function validVariant(value: string | null): VariantKey {
  return variantKeys.includes(value as VariantKey) ? (value as VariantKey) : 'A'
}

function validScreen(value: string | null): Screen {
  return value && value in screenLabels ? (value as Screen) : 'owner-calendar'
}

function validDataState(value: string | null): DataState {
  return ['content', 'empty', 'loading', 'error'].includes(value ?? '')
    ? (value as DataState)
    : 'content'
}

function PrototypeSwitcher({
  current,
  onChange,
}: {
  current: VariantKey
  onChange: (variant: VariantKey) => void
}) {
  const move = useCallback((direction: number) => {
    const index = variantKeys.indexOf(current)
    onChange(variantKeys[(index + direction + variantKeys.length) % variantKeys.length])
  }, [current, onChange])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target
      if (
        target instanceof HTMLElement &&
        (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable)
      ) return
      if (event.key === 'ArrowLeft') move(-1)
      if (event.key === 'ArrowRight') move(1)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [move])

  return (
    <div className="prototype-switcher" aria-label="Варианты прототипа">
      <button onClick={() => move(-1)} aria-label="Предыдущий вариант">←</button>
      <span><strong>{current}</strong> · {variantNames[current]}</span>
      <button onClick={() => move(1)} aria-label="Следующий вариант">→</button>
    </div>
  )
}

function intervalsValid(intervals: Interval[]) {
  const sorted = [...intervals].sort((a, b) => a.start.localeCompare(b.start))
  return sorted.every((interval, index) => {
    if (!interval.start || !interval.end || interval.start >= interval.end) return false
    return index === 0 || sorted[index - 1].end <= interval.start
  })
}

export default function PrototypePages() {
  const [searchParams, setSearchParams] = useSearchParams()
  const variant = validVariant(searchParams.get('variant'))
  const screen = validScreen(searchParams.get('screen'))
  const dataState = validDataState(searchParams.get('state'))

  const [types, setTypes] = useState(initialTypes)
  const [bookings, setBookings] = useState(initialBookings)
  const [selectedTypeId, setSelectedTypeId] = useState<number | null>(2)
  const [selectedDate, setSelectedDate] = useState<string | null>('2026-11-13')
  const [selectedSlot, setSelectedSlot] = useState<string | null>('10:45')
  const [guest, setGuest] = useState<GuestDraft>({ name: '', email: '' })
  const [guestErrors, setGuestErrors] = useState<Partial<GuestDraft>>({})
  const [typeDraft, setTypeDraft] = useState<TypeDraft>({ name: '', description: '', duration: '30' })
  const [typeErrors, setTypeErrors] = useState<Partial<TypeDraft>>({})
  const [availability, setAvailability] = useState<AvailabilityDraft>(initialAvailability)
  const [savedAvailability, setSavedAvailability] = useState<AvailabilityDraft>(initialAvailability)
  const [availabilityError, setAvailabilityError] = useState('')
  const [notice, setNotice] = useState('')
  const [cancelBooking, setCancelBooking] = useState<Booking | null>(null)

  const draftDirty = useMemo(
    () => JSON.stringify(availability) !== JSON.stringify(savedAvailability),
    [availability, savedAvailability],
  )

  const setParam = useCallback((key: string, value: string) => {
    const next = new URLSearchParams(searchParams)
    next.set(key, value)
    setSearchParams(next, { replace: true })
  }, [searchParams, setSearchParams])

  const changeVariant = useCallback((nextVariant: VariantKey) => {
    setParam('variant', nextVariant)
  }, [setParam])

  const navigate = (nextScreen: Screen) => {
    setNotice('')
    setParam('screen', nextScreen)
  }

  const changeDataState = (state: DataState) => {
    setNotice('')
    setParam('state', state)
  }

  const retry = () => {
    setParam('state', 'loading')
    window.setTimeout(() => setParam('state', 'content'), 350)
  }

  const props = {
    screen,
    dataState,
    types,
    bookings,
    selectedTypeId,
    selectedDate,
    selectedSlot,
    guest,
    guestErrors,
    typeDraft,
    typeErrors,
    availability,
    availabilityError,
    notice,
    draftDirty,
    cancelBooking,
    onNavigate: navigate,
    onDataStateChange: changeDataState,
    onSelectType: (id: number) => {
      setSelectedTypeId(id)
      setSelectedDate('2026-11-13')
      setSelectedSlot(null)
      setNotice('')
      setParam('screen', 'book-slot')
    },
    onSelectDate: (date: string) => {
      setSelectedDate(date)
      setSelectedSlot(null)
    },
    onSelectSlot: (slot: string) => {
      setSelectedSlot(slot)
      setNotice('')
      setParam('screen', 'book-details')
    },
    onGuestChange: (field: keyof GuestDraft, value: string) => {
      setGuest((current) => ({ ...current, [field]: value }))
      setGuestErrors((current) => ({ ...current, [field]: undefined }))
    },
    onBook: () => {
      const name = guest.name.trim()
      const email = guest.email.trim()
      const errors: Partial<GuestDraft> = {}
      if (!name) errors.name = 'Укажите имя'
      if (!email) errors.email = 'Укажите email'
      else if (!/^[^\s@]+@[^\s@]+$/.test(email)) errors.email = 'Проверьте формат email'
      setGuestErrors(errors)
      if (Object.keys(errors).length > 0) return
      setGuest({ name, email })
      setNotice('')
      setParam('screen', 'book-success')
    },
    onSimulateConflict: () => {
      setSelectedDate(null)
      setSelectedSlot(null)
      setNotice('Выбранное время уже занято. Доступность обновлена — выберите другой слот.')
      setParam('screen', 'book-slot')
    },
    onRestart: () => {
      setSelectedTypeId(null)
      setSelectedDate(null)
      setSelectedSlot(null)
      setGuest({ name: '', email: '' })
      setGuestErrors({})
      setNotice('')
      const next = new URLSearchParams(searchParams)
      next.set('screen', 'book-type')
      next.set('state', 'content')
      setSearchParams(next, { replace: true })
    },
    onTypeDraftChange: (field: keyof TypeDraft, value: string) => {
      setTypeDraft((current) => ({ ...current, [field]: value }))
      setTypeErrors((current) => ({ ...current, [field]: undefined }))
    },
    onCreateType: () => {
      const name = typeDraft.name.trim()
      const description = typeDraft.description.trim()
      const duration = Number(typeDraft.duration)
      const errors: Partial<TypeDraft> = {}
      if (!name) errors.name = 'Укажите название'
      else if (types.some((type) => type.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
        errors.name = 'Тип с таким названием уже существует'
      }
      if (!description) errors.description = 'Укажите описание'
      if (!Number.isInteger(duration) || duration < 1 || duration > 1440) {
        errors.duration = 'Введите целое число от 1 до 1440'
      }
      setTypeErrors(errors)
      if (Object.keys(errors).length > 0) return
      setTypes((current) => [...current, { id: Date.now(), name, description, duration }])
      setTypeDraft({ name: '', description: '', duration: '30' })
      setNotice(`Тип встречи «${name}» создан`)
    },
    onAvailabilityChange: (draft: AvailabilityDraft) => {
      setAvailability(draft)
      setAvailabilityError('')
      setNotice('')
    },
    onSaveAvailability: () => {
      const weekValid = availability.week.every((day) => intervalsValid(day.intervals))
      const exceptionsValid = availability.exceptions.every(
        (exception) => exception.closed || (exception.intervals.length > 0 && intervalsValid(exception.intervals)),
      )
      if (!weekValid || !exceptionsValid) {
        setAvailabilityError('Проверьте интервалы: начало раньше окончания, пересечения запрещены')
        return
      }
      setAvailabilityError('')
      setSavedAvailability(availability)
      setNotice('Доступность сохранена')
    },
    onDiscardAvailability: () => {
      if (!window.confirm('Отменить все несохранённые изменения?')) return
      setAvailability(savedAvailability)
      setAvailabilityError('')
      setNotice('Изменения отменены')
    },
    onRequestCancel: (booking: Booking) => setCancelBooking(booking),
    onConfirmCancel: () => {
      if (!cancelBooking) return
      setBookings((current) => current.filter((booking) => booking.id !== cancelBooking.id))
      setCancelBooking(null)
      setNotice('Встреча отменена')
    },
    onCloseCancel: () => setCancelBooking(null),
    onRetry: retry,
  }

  const stateSnapshot = {
    variant,
    screen,
    dataState,
    selectedTypeId,
    selectedDate,
    selectedSlot,
    guest,
    draftDirty,
    typeCount: types.length,
    bookingCount: bookings.length,
  }

  return (
    <div className="prototype-root">
      {import.meta.env.DEV && <div className="prototype-toolbar">
        <strong>PROTOTYPE · не итоговый интерфейс</strong>
        <label>Экран<select value={screen} onChange={(event) => navigate(event.target.value as Screen)}>{Object.entries(screenLabels).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></label>
        <label>Данные<select value={dataState} onChange={(event) => changeDataState(event.target.value as DataState)}><option value="content">Основные</option><option value="empty">Пустые</option><option value="loading">Загрузка</option><option value="error">Ошибка</option></select></label>
      </div>}
      {variant === 'A' && <VariantA {...props} />}
      {variant === 'B' && <VariantB {...props} />}
      {variant === 'C' && <VariantC {...props} />}
      {import.meta.env.DEV && <>
        <details className="prototype-state"><summary>Состояние</summary><pre>{JSON.stringify(stateSnapshot, null, 2)}</pre></details>
        <PrototypeSwitcher current={variant} onChange={changeVariant} />
      </>}
    </div>
  )
}
