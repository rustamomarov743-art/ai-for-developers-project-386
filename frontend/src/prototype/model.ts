export type VariantKey = 'A' | 'B' | 'C'
export type DataState = 'content' | 'empty' | 'loading' | 'error'
export type Screen =
  | 'owner-calendar'
  | 'owner-types'
  | 'owner-availability'
  | 'book-type'
  | 'book-slot'
  | 'book-details'
  | 'book-success'

export interface MeetingType {
  id: number
  name: string
  description: string
  duration: number
}

export interface Booking {
  id: number
  type: string
  date: string
  day: number
  time: string
  duration: number
  guest: string
  email: string
  current?: boolean
}

export interface Interval {
  id: number
  start: string
  end: string
}

export interface WeekDay {
  day: string
  short: string
  intervals: Interval[]
}

export interface AvailabilityException {
  id: number
  date: string
  closed: boolean
  intervals: Interval[]
}

export interface AvailabilityDraft {
  timezone: string
  week: WeekDay[]
  exceptions: AvailabilityException[]
}

export interface TypeDraft {
  name: string
  description: string
  duration: string
}

export interface GuestDraft {
  name: string
  email: string
}

export interface PrototypeProps {
  screen: Screen
  dataState: DataState
  types: MeetingType[]
  bookings: Booking[]
  selectedTypeId: number | null
  selectedDate: string | null
  selectedSlot: string | null
  guest: GuestDraft
  guestErrors: Partial<GuestDraft>
  typeDraft: TypeDraft
  typeErrors: Partial<TypeDraft>
  availability: AvailabilityDraft
  availabilityError: string
  notice: string
  draftDirty: boolean
  cancelBooking: Booking | null
  onNavigate: (screen: Screen) => void
  onDataStateChange: (state: DataState) => void
  onSelectType: (id: number) => void
  onSelectDate: (date: string) => void
  onSelectSlot: (slot: string) => void
  onGuestChange: (field: keyof GuestDraft, value: string) => void
  onBook: () => void
  onSimulateConflict: () => void
  onRestart: () => void
  onTypeDraftChange: (field: keyof TypeDraft, value: string) => void
  onCreateType: () => void
  onAvailabilityChange: (draft: AvailabilityDraft) => void
  onSaveAvailability: () => void
  onDiscardAvailability: () => void
  onRequestCancel: (booking: Booking) => void
  onConfirmCancel: () => void
  onCloseCancel: () => void
  onRetry: () => void
}

export const screenLabels: Record<Screen, string> = {
  'owner-calendar': 'Владелец: календарь',
  'owner-types': 'Владелец: типы встреч',
  'owner-availability': 'Владелец: доступность',
  'book-type': 'Гость: тип встречи',
  'book-slot': 'Гость: дата и слот',
  'book-details': 'Гость: данные',
  'book-success': 'Гость: подтверждение',
}

export const initialTypes: MeetingType[] = [
  {
    id: 1,
    name: 'Знакомство',
    description: 'Короткий разговор о задаче и ожиданиях.',
    duration: 15,
  },
  {
    id: 2,
    name: 'Консультация',
    description: 'Разбираем ваш вопрос и намечаем следующие шаги.',
    duration: 45,
  },
  {
    id: 3,
    name: 'Планирование проекта',
    description: 'Обсуждаем объём, сроки и приоритеты проекта.',
    duration: 60,
  },
]

export const initialBookings: Booking[] = [
  {
    id: 1,
    type: 'Консультация',
    date: '12 ноября',
    day: 12,
    time: '10:00',
    duration: 45,
    guest: 'Анна Смирнова',
    email: 'anna@example.com',
    current: true,
  },
  {
    id: 2,
    type: 'Знакомство',
    date: '13 ноября',
    day: 13,
    time: '11:30',
    duration: 15,
    guest: 'Илья Петров',
    email: 'ilya@example.com',
  },
  {
    id: 3,
    type: 'Планирование проекта',
    date: '16 ноября',
    day: 16,
    time: '14:00',
    duration: 60,
    guest: 'Мария Орлова',
    email: 'maria@example.com',
  },
  {
    id: 4,
    type: 'Консультация',
    date: '24 ноября',
    day: 24,
    time: '09:15',
    duration: 45,
    guest: 'Олег Волков',
    email: 'oleg@example.com',
  },
]

export const initialAvailability: AvailabilityDraft = {
  timezone: 'Europe/Moscow',
  week: [
    { day: 'Понедельник', short: 'Пн', intervals: [{ id: 1, start: '09:00', end: '13:00' }] },
    { day: 'Вторник', short: 'Вт', intervals: [{ id: 2, start: '10:00', end: '16:00' }] },
    { day: 'Среда', short: 'Ср', intervals: [{ id: 3, start: '09:00', end: '13:00' }] },
    { day: 'Четверг', short: 'Чт', intervals: [{ id: 4, start: '10:00', end: '16:00' }] },
    { day: 'Пятница', short: 'Пт', intervals: [{ id: 5, start: '09:00', end: '12:00' }] },
    { day: 'Суббота', short: 'Сб', intervals: [] },
    { day: 'Воскресенье', short: 'Вс', intervals: [] },
  ],
  exceptions: [
    { id: 1, date: '2026-11-20', closed: true, intervals: [] },
    {
      id: 2,
      date: '2026-11-23',
      closed: false,
      intervals: [{ id: 6, start: '12:00', end: '15:00' }],
    },
  ],
}

export const guestDays = [
  { date: '2026-11-12', label: 'Чт, 12 ноября', short: 'Чт 12', disabled: false },
  { date: '2026-11-13', label: 'Пт, 13 ноября', short: 'Пт 13', disabled: false },
  { date: '2026-11-14', label: 'Сб, 14 ноября', short: 'Сб 14', disabled: true },
  { date: '2026-11-15', label: 'Вс, 15 ноября', short: 'Вс 15', disabled: true },
  { date: '2026-11-16', label: 'Пн, 16 ноября', short: 'Пн 16', disabled: false },
  { date: '2026-11-17', label: 'Вт, 17 ноября', short: 'Вт 17', disabled: false },
  { date: '2026-11-18', label: 'Ср, 18 ноября', short: 'Ср 18', disabled: false },
  { date: '2026-11-19', label: 'Чт, 19 ноября', short: 'Чт 19', disabled: false },
  { date: '2026-11-20', label: 'Пт, 20 ноября', short: 'Пт 20', disabled: true },
  { date: '2026-11-21', label: 'Сб, 21 ноября', short: 'Сб 21', disabled: true },
  { date: '2026-11-22', label: 'Вс, 22 ноября', short: 'Вс 22', disabled: true },
  { date: '2026-11-23', label: 'Пн, 23 ноября', short: 'Пн 23', disabled: false },
  { date: '2026-11-24', label: 'Вт, 24 ноября', short: 'Вт 24', disabled: false },
  { date: '2026-11-25', label: 'Ср, 25 ноября', short: 'Ср 25', disabled: false },
]

export const freeSlots = ['09:00', '10:45', '11:30', '13:00', '14:30']
export const busySlots = [
  { start: '10:00', end: '10:45' },
  { start: '12:15', end: '13:00' },
]

export const monthDays: Array<number | null> = [
  null, null, null, null, null, null, 1,
  2, 3, 4, 5, 6, 7, 8,
  9, 10, 11, 12, 13, 14, 15,
  16, 17, 18, 19, 20, 21, 22,
  23, 24, 25, 26, 27, 28, 29,
  30, null, null, null, null, null, null,
]

export function selectedMeetingType(props: PrototypeProps) {
  return props.types.find((type) => type.id === props.selectedTypeId) ?? props.types[0]
}

export function updateInterval(
  draft: AvailabilityDraft,
  dayIndex: number,
  intervalId: number,
  field: 'start' | 'end',
  value: string,
): AvailabilityDraft {
  return {
    ...draft,
    week: draft.week.map((day, index) =>
      index === dayIndex
        ? {
            ...day,
            intervals: day.intervals.map((interval) =>
              interval.id === intervalId ? { ...interval, [field]: value } : interval,
            ),
          }
        : day,
    ),
  }
}

export function addInterval(draft: AvailabilityDraft, dayIndex: number): AvailabilityDraft {
  return {
    ...draft,
    week: draft.week.map((day, index) =>
      index === dayIndex
        ? {
            ...day,
            intervals: [
              ...day.intervals,
              { id: Date.now(), start: '09:00', end: '10:00' },
            ],
          }
        : day,
    ),
  }
}

export function removeInterval(
  draft: AvailabilityDraft,
  dayIndex: number,
  intervalId: number,
): AvailabilityDraft {
  return {
    ...draft,
    week: draft.week.map((day, index) =>
      index === dayIndex
        ? { ...day, intervals: day.intervals.filter((interval) => interval.id !== intervalId) }
        : day,
    ),
  }
}

export function addException(draft: AvailabilityDraft): AvailabilityDraft {
  return {
    ...draft,
    exceptions: [
      ...draft.exceptions,
      { id: Date.now(), date: '2026-11-26', closed: true, intervals: [] },
    ],
  }
}
