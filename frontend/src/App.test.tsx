import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  cancelMeeting,
  createBooking,
  createMeetingType,
  getAvailability,
  getBookingAvailability,
  listBookingMeetingTypes,
  listMeetingTypes,
  listOwnerMeetings,
  replaceAvailability,
} from './api/generated/sdk.gen'
import type {
  Availability,
  BookingAvailability,
  Meeting,
  MeetingType,
  OwnerMeeting,
  WeeklyTemplate,
} from './api/generated/types.gen'
import App from './App'

vi.mock('./api/generated/sdk.gen', () => ({
  cancelMeeting: vi.fn(),
  createBooking: vi.fn(),
  createMeetingType: vi.fn(),
  getAvailability: vi.fn(),
  getBookingAvailability: vi.fn(),
  listBookingMeetingTypes: vi.fn(),
  listMeetingTypes: vi.fn(),
  listOwnerMeetings: vi.fn(),
  replaceAvailability: vi.fn(),
}))

const cancelMeetingMock = vi.mocked(cancelMeeting)
const createBookingMock = vi.mocked(createBooking)
const listMeetingTypesMock = vi.mocked(listMeetingTypes)
const listOwnerMeetingsMock = vi.mocked(listOwnerMeetings)
const createMeetingTypeMock = vi.mocked(createMeetingType)
const getAvailabilityMock = vi.mocked(getAvailability)
const replaceAvailabilityMock = vi.mocked(replaceAvailability)
const listBookingMeetingTypesMock = vi.mocked(listBookingMeetingTypes)
const getBookingAvailabilityMock = vi.mocked(getBookingAvailability)
const meetingTypesRequest = new Request(
  'http://localhost:8080/api/owner/meeting-types',
)
const availabilityRequest = new Request(
  'http://localhost:8080/api/owner/availability',
)
const ownerMeetingsRequest = new Request(
  'http://localhost:8080/api/owner/meetings',
)
const bookingTypesRequest = new Request(
  'http://localhost:8080/api/booking/meeting-types?timeZone=UTC',
)
const bookingAvailabilityRequest = new Request(
  'http://localhost:8080/api/booking/meeting-types/type-1/availability?timeZone=UTC',
)
const createBookingRequest = new Request(
  'http://localhost:8080/api/booking/bookings',
  { method: 'POST' },
)
const cancellationRequest = new Request(
  'http://localhost:8080/api/owner/meetings/future/cancellation',
  { method: 'POST' },
)
const emptyWeeklyTemplate: WeeklyTemplate = {
  MONDAY: [],
  TUESDAY: [],
  WEDNESDAY: [],
  THURSDAY: [],
  FRIDAY: [],
  SATURDAY: [],
  SUNDAY: [],
}

beforeEach(() => {
  cancelMeetingMock.mockReset()
  createBookingMock.mockReset()
  listMeetingTypesMock.mockReset()
  listOwnerMeetingsMock.mockReset()
  createMeetingTypeMock.mockReset()
  getAvailabilityMock.mockReset()
  replaceAvailabilityMock.mockReset()
  listBookingMeetingTypesMock.mockReset()
  getBookingAvailabilityMock.mockReset()
  listBookingMeetingTypesMock.mockResolvedValue({
    data: [],
    request: bookingTypesRequest,
    response: new Response(null, { status: 200 }),
  })
  getBookingAvailabilityMock.mockResolvedValue({
    data: { days: [] },
    request: bookingAvailabilityRequest,
    response: new Response(null, { status: 200 }),
  })
  getAvailabilityMock.mockResolvedValue({
    data: { exists: false },
    request: availabilityRequest,
    response: new Response(null, { status: 200 }),
  })
  listMeetingTypesMock.mockResolvedValue({
    data: [],
    request: meetingTypesRequest,
    response: new Response(null, { status: 200 }),
  })
  listOwnerMeetingsMock.mockResolvedValue({
    data: [],
    request: ownerMeetingsRequest,
    response: new Response(null, { status: 200 }),
  })
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

function renderApp(initialEntry = '/') {
  const router = createMemoryRouter([{ path: '*', element: <App /> }], {
    initialEntries: [initialEntry],
  })
  return render(<RouterProvider router={router} />)
}

function bookingType(id: string, name: string): MeetingType {
  return {
    id,
    name,
    description: `Описание: ${name}`,
    durationMinutes: 45,
    createdAt: '2026-11-13T09:00:00Z',
  }
}

function bookingAvailability(): BookingAvailability {
  return {
    days: Array.from({ length: 14 }, (_, index) => ({
      date: `2026-11-${String(index + 13).padStart(2, '0')}`,
      hasAvailableSlots: index >= 2,
      slots:
        index >= 2
          ? [
              {
                startsAt: `2026-11-${String(index + 13).padStart(2, '0')}T10:00:00Z`,
                endsAt: `2026-11-${String(index + 13).padStart(2, '0')}T10:45:00Z`,
                status: 'AVAILABLE',
              },
            ]
          : [],
      busyIntervals: [],
    })),
  }
}

function mockBookingSelection(meetingType = bookingType('type-1', 'Консультация')) {
  listBookingMeetingTypesMock.mockResolvedValue({
    data: [meetingType],
    request: bookingTypesRequest,
    response: new Response(null, { status: 200 }),
  })
  getBookingAvailabilityMock.mockResolvedValue({
    data: bookingAvailability(),
    request: bookingAvailabilityRequest,
    response: new Response(null, { status: 200 }),
  })
  return meetingType
}

async function openBookingForm(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: /Консультация/ }))
  const slotTime = new Intl.DateTimeFormat('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  }).format(new Date('2026-11-15T10:00:00Z'))
  await user.click(await screen.findByRole('button', { name: slotTime }))
}

function createdMeeting(meetingType: MeetingType): Meeting {
  return {
    id: 'meeting-1',
    meetingTypeId: meetingType.id,
    startsAt: '2026-11-15T10:00:00Z',
    endsAt: '2026-11-15T10:45:00Z',
    guestName: 'Иван Петров',
    guestEmail: 'ivan@example.com',
    createdAt: '2026-11-13T09:00:00Z',
    status: 'SCHEDULED',
    meetingType,
  }
}

function ownerMeeting(
  id: string,
  startsAt: string,
  endsAt: string,
  name = 'Консультация',
  inProgress = false,
): OwnerMeeting {
  const meetingType = bookingType(`type-${id}`, name)
  return {
    id,
    meetingTypeId: meetingType.id,
    startsAt,
    endsAt,
    guestName: `Гость ${id}`,
    guestEmail: `${id}@example.com`,
    createdAt: '2026-11-13T09:00:00Z',
    status: 'SCHEDULED',
    meetingType,
    durationMinutes: meetingType.durationMinutes,
    inProgress,
  }
}

describe('Главная страница', () => {
  it('описывает возможности гостя', () => {
    renderApp()

    expect(
      screen.getByRole('heading', {
        name: 'Забронируйте встречу без регистрации',
        level: 1,
      }),
    ).toBeInTheDocument()
    expect(screen.getByText('Выбор типа встречи')).toBeInTheDocument()
    expect(
      screen.getByText('Свободные слоты на ближайшие 14 дней'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Подтверждение записи по имени и email'),
    ).toBeInTheDocument()
  })

  it('позволяет гостю перейти к бронированию', async () => {
    const user = userEvent.setup()
    renderApp()

    await user.click(
      screen.getByRole('link', { name: 'Забронировать встречу' }),
    )

    expect(
      await screen.findByRole('heading', { name: 'Бронирование встречи' }),
    ).toBeInTheDocument()
  })

  it('позволяет владельцу открыть свою страницу', async () => {
    const user = userEvent.setup()
    renderApp()

    await user.click(screen.getByRole('link', { name: 'Страница владельца' }))

    expect(
      await screen.findByRole('heading', { name: 'Встречи', level: 1 }),
    ).toBeInTheDocument()
    expect(
      await screen.findByText('Предстоящих встреч пока нет'),
    ).toBeInTheDocument()
  })
})

describe('Навигация владельца', () => {
  it('содержит переходы ко всем разделам владельца', () => {
    renderApp('/owner')

    expect(screen.getByRole('link', { name: 'Встречи' })).toHaveAttribute(
      'href',
      '/owner',
    )
    expect(
      screen.getByRole('link', { name: 'Типы встреч' }),
    ).toHaveAttribute('href', '/owner/meeting-types')
    expect(screen.getByRole('link', { name: 'Доступность' })).toHaveAttribute(
      'href',
      '/owner/availability',
    )
  })
})

describe('Встречи владельца', () => {
  it('показывает загрузку отдельно от пустого состояния и ошибки', () => {
    listOwnerMeetingsMock.mockReturnValue(
      new Promise<{
        data: OwnerMeeting[]
        request: Request
        response: Response
      }>(() => {}),
    )
    renderApp('/owner')

    expect(screen.getByText('Загрузка…')).toBeInTheDocument()
    expect(
      screen.queryByText('Предстоящих встреч пока нет'),
    ).not.toBeInTheDocument()
    expect(screen.queryByText('Не удалось загрузить встречи')).not.toBeInTheDocument()
  })

  it('отличает ошибку загрузки от пустого списка и позволяет повторить запрос', async () => {
    const user = userEvent.setup()
    listOwnerMeetingsMock.mockRejectedValueOnce(new Error('network'))
    renderApp('/owner')

    expect(
      await screen.findByText('Не удалось загрузить встречи'),
    ).toBeInTheDocument()
    expect(
      screen.queryByText('Предстоящих встреч пока нет'),
    ).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Повторить' }))

    expect(
      await screen.findByText('Предстоящих встреч пока нет'),
    ).toBeInTheDocument()
    expect(listOwnerMeetingsMock).toHaveBeenCalledTimes(2)
  })

  it('группирует встречи по локальным датам и показывает данные гостя и прогресс', async () => {
    listOwnerMeetingsMock.mockResolvedValue({
      data: [
        ownerMeeting(
          'first',
          '2026-11-16T10:00:00Z',
          '2026-11-16T10:45:00Z',
          'Консультация',
          true,
        ),
        ownerMeeting('second', '2026-11-16T11:00:00Z', '2026-11-16T11:45:00Z', 'Демо'),
        ownerMeeting('third', '2026-11-17T09:00:00Z', '2026-11-17T09:45:00Z'),
      ],
      request: ownerMeetingsRequest,
      response: new Response(null, { status: 200 }),
    })
    renderApp('/owner')

    const firstDate = await screen.findByRole('heading', {
      name: /16 ноября 2026/,
      level: 2,
    })
    const firstGroup = firstDate.closest('section')
    expect(firstGroup).not.toBeNull()
    expect(within(firstGroup!).getAllByRole('article')).toHaveLength(2)
    const firstMeeting = within(firstGroup!).getAllByRole('article')[0]
    expect(firstMeeting).toHaveTextContent('Консультация')
    expect(firstMeeting).toHaveTextContent('13:00–13:45')
    expect(firstMeeting).toHaveTextContent('45 мин')
    expect(firstMeeting).toHaveTextContent('Гость first')
    expect(firstMeeting).toHaveTextContent('first@example.com')
    expect(firstMeeting).toHaveTextContent('Идёт сейчас')
    expect(
      screen.getByRole('heading', { name: /17 ноября 2026/, level: 2 }),
    ).toBeInTheDocument()
    expect(
      within(firstGroup!.parentElement!).getAllByRole('heading', { level: 2 }),
    ).toHaveLength(2)
  })

  it('открывает диалог только для будущей встречи и закрывает его без изменений', async () => {
    const user = userEvent.setup()
    listOwnerMeetingsMock.mockResolvedValue({
      data: [
        ownerMeeting(
          'current',
          '2026-11-16T09:00:00Z',
          '2026-11-16T09:45:00Z',
          'Текущая',
          true,
        ),
        ownerMeeting(
          'future',
          '2026-11-16T10:00:00Z',
          '2026-11-16T10:45:00Z',
          'Консультация',
        ),
      ],
      request: ownerMeetingsRequest,
      response: new Response(null, { status: 200 }),
    })
    renderApp('/owner')
    expect(await screen.findByText('Гость future')).toBeInTheDocument()

    const cancelButtons = screen.getAllByRole('button', {
      name: 'Отменить встречу',
    })
    expect(cancelButtons).toHaveLength(1)
    await user.click(cancelButtons[0])

    const dialog = screen.getByRole('dialog', { name: 'Отменить встречу?' })
    expect(dialog).toHaveTextContent('Консультация')
    expect(dialog).toHaveTextContent('Гость future')
    expect(dialog).toHaveTextContent(/16 ноября 2026/)
    expect(dialog).toHaveTextContent('13:00–13:45')

    await user.click(within(dialog).getByRole('button', { name: 'Не отменять' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByText('Гость future')).toBeInTheDocument()
    expect(cancelMeetingMock).not.toHaveBeenCalled()
  })

  it('подтверждает отмену, скрывает встречу и показывает успех', async () => {
    const user = userEvent.setup()
    const future = ownerMeeting(
      'future',
      '2026-11-16T10:00:00Z',
      '2026-11-16T10:45:00Z',
    )
    listOwnerMeetingsMock.mockResolvedValue({
      data: [future],
      request: ownerMeetingsRequest,
      response: new Response(null, { status: 200 }),
    })
    cancelMeetingMock.mockResolvedValue({
      data: { ...future, status: 'CANCELLED' },
      request: cancellationRequest,
      response: new Response(null, { status: 200 }),
    })
    renderApp('/owner')
    await user.click(
      await screen.findByRole('button', { name: 'Отменить встречу' }),
    )

    await user.click(screen.getByRole('button', { name: 'Подтвердить отмену' }))

    expect(await screen.findByText('Встреча отменена')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByText('Гость future')).not.toBeInTheDocument()
    expect(screen.getByText('Предстоящих встреч пока нет')).toBeInTheDocument()
    expect(cancelMeetingMock).toHaveBeenCalledWith({ path: { id: 'future' } })
  })

  it('обновляет встречу и сообщает, если отмена опоздала', async () => {
    const user = userEvent.setup()
    const future = ownerMeeting(
      'future',
      '2026-11-16T10:00:00Z',
      '2026-11-16T10:45:00Z',
    )
    listOwnerMeetingsMock
      .mockResolvedValueOnce({
        data: [future],
        request: ownerMeetingsRequest,
        response: new Response(null, { status: 200 }),
      })
      .mockResolvedValueOnce({
        data: [{ ...future, inProgress: true }],
        request: ownerMeetingsRequest,
        response: new Response(null, { status: 200 }),
      })
    cancelMeetingMock.mockResolvedValue({
      data: undefined,
      error: {
        type: 'about:blank',
        title: 'Conflict',
        status: 409,
        detail: 'Встречу нельзя отменить после начала',
        instance: '/api/owner/meetings/future/cancellation',
        code: 'MEETING_ALREADY_STARTED',
      },
      request: cancellationRequest,
      response: new Response(null, { status: 409 }),
    })
    renderApp('/owner')
    await user.click(
      await screen.findByRole('button', { name: 'Отменить встречу' }),
    )

    await user.click(screen.getByRole('button', { name: 'Подтвердить отмену' }))

    expect(
      await screen.findByText('Встречу нельзя отменить после начала'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(await screen.findByText('Идёт сейчас')).toBeInTheDocument()
    expect(screen.getByText('Гость future')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Отменить встречу' }),
    ).not.toBeInTheDocument()
    expect(listOwnerMeetingsMock).toHaveBeenCalledTimes(2)
  })

  it('сохраняет встречу при сбое и позволяет повторить отмену', async () => {
    const user = userEvent.setup()
    const future = ownerMeeting(
      'future',
      '2026-11-16T10:00:00Z',
      '2026-11-16T10:45:00Z',
    )
    listOwnerMeetingsMock.mockResolvedValue({
      data: [future],
      request: ownerMeetingsRequest,
      response: new Response(null, { status: 200 }),
    })
    cancelMeetingMock
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce({
        data: { ...future, status: 'CANCELLED' },
        request: cancellationRequest,
        response: new Response(null, { status: 200 }),
      })
    renderApp('/owner')
    await user.click(
      await screen.findByRole('button', { name: 'Отменить встречу' }),
    )

    await user.click(screen.getByRole('button', { name: 'Подтвердить отмену' }))

    expect(
      await screen.findByText('Не удалось отменить встречу. Попробуйте ещё раз'),
    ).toBeInTheDocument()
    expect(screen.getAllByText('Гость future')).toHaveLength(2)
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Подтвердить отмену' }))

    expect(await screen.findByText('Встреча отменена')).toBeInTheDocument()
    expect(screen.queryByText('Гость future')).not.toBeInTheDocument()
    expect(cancelMeetingMock).toHaveBeenCalledTimes(2)
  })

  it('показывает независимый месячный календарь без прошлых дней и гостевого окна', async () => {
    vi.useFakeTimers({
      now: new Date('2026-11-13T09:00:00Z'),
      shouldAdvanceTime: true,
    })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    listOwnerMeetingsMock.mockResolvedValue({
      data: [
        ownerMeeting('past', '2026-11-12T10:00:00Z', '2026-11-12T10:45:00Z', 'Прошлая'),
        ownerMeeting('today', '2026-11-13T10:00:00Z', '2026-11-13T10:45:00Z', 'Сегодняшняя'),
        ownerMeeting('future', '2027-01-15T10:00:00Z', '2027-01-15T10:45:00Z', 'Далёкая'),
      ],
      request: ownerMeetingsRequest,
      response: new Response(null, { status: 200 }),
    })
    renderApp('/owner')
    expect(await screen.findByText('Гость today')).toBeInTheDocument()

    await user.click(screen.getByText('Календарь на месяц'))

    expect(screen.getByRole('heading', { name: 'Ноябрь 2026' })).toBeInTheDocument()
    expect(screen.getByText('Часовой пояс: Europe/Moscow')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Предыдущий месяц' })).toBeDisabled()
    const pastDay = screen.getByRole('cell', { name: /12 ноября 2026/ })
    expect(pastDay).toHaveClass('past-day')
    expect(pastDay).not.toHaveTextContent('Прошлая')
    expect(within(pastDay).queryByRole('button')).not.toBeInTheDocument()
    expect(within(pastDay).queryByRole('link')).not.toBeInTheDocument()
    const today = screen.getByRole('cell', { name: /13 ноября 2026/ })
    expect(today).toHaveTextContent('13:00')
    expect(today).toHaveTextContent('Сегодняшняя')
    expect(within(today).queryByRole('button')).not.toBeInTheDocument()
    expect(within(today).queryByRole('link')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Следующий месяц' }))
    expect(screen.getByRole('heading', { name: 'Декабрь 2026' })).toBeInTheDocument()
    expect(screen.getByText('Гость today')).toBeInTheDocument()
    expect(listOwnerMeetingsMock).toHaveBeenCalledTimes(1)

    await user.click(screen.getByRole('button', { name: 'Следующий месяц' }))
    expect(screen.getByRole('heading', { name: 'Январь 2027' })).toBeInTheDocument()
    const futureDay = screen.getByRole('cell', { name: /15 января 2027/ })
    expect(futureDay).toHaveTextContent('13:00')
    expect(futureDay).toHaveTextContent('Далёкая')
    expect(screen.getByRole('button', { name: 'Предыдущий месяц' })).toBeEnabled()
    expect(screen.getByText('Гость today')).toBeInTheDocument()
  })
})

describe('Типы встреч', () => {
  it('добавляет созданный тип в конец без повторной загрузки и очищает форму', async () => {
    const user = userEvent.setup()
    listMeetingTypesMock.mockResolvedValue({
      data: [
        {
          id: 'first',
          name: 'Первый тип',
          description: 'Уже существует',
          durationMinutes: 30,
          createdAt: '2026-11-13T09:00:00Z',
        },
      ],
      request: meetingTypesRequest,
    response: new Response(null, { status: 200 }),
    })
    createMeetingTypeMock.mockResolvedValue({
      data: {
        id: 'new',
        name: 'Новый тип',
        description: 'Создан через форму',
        durationMinutes: 37,
        createdAt: '2026-11-13T09:01:00Z',
      },
      request: meetingTypesRequest,
      response: new Response(null, { status: 201 }),
    })
    renderApp('/owner/meeting-types')
    expect(await screen.findByText('Первый тип')).toBeInTheDocument()

    await user.type(screen.getByLabelText('Название'), 'Новый тип')
    await user.type(screen.getByLabelText('Описание'), 'Создан через форму')
    await user.type(screen.getByLabelText('Длительность (минуты)'), '37')
    await user.click(screen.getByRole('button', { name: 'Создать тип' }))

    expect(await screen.findByText('Тип встречи создан')).toBeInTheDocument()
    expect(createMeetingTypeMock).toHaveBeenCalledWith({
      body: {
        name: 'Новый тип',
        description: 'Создан через форму',
        durationMinutes: 37,
      },
    })
    expect(listMeetingTypesMock).toHaveBeenCalledTimes(1)
    expect(screen.getByLabelText('Название')).toHaveValue('')
    expect(screen.getByLabelText('Описание')).toHaveValue('')
    expect(screen.getByLabelText('Длительность (минуты)')).toHaveValue(null)
    const items = screen.getAllByRole('listitem')
    expect(items[0]).toHaveTextContent('Первый тип')
    expect(items[1]).toHaveTextContent('Новый тип')
    expect(items[1]).toHaveTextContent('37 мин')
  })

  it.each([400, 409])(
    'показывает полевую ошибку при ответе %s и сохраняет форму',
    async (status) => {
      const user = userEvent.setup()
      createMeetingTypeMock.mockResolvedValue({
        error: {
          type: 'about:blank',
          title: status === 400 ? 'Bad Request' : 'Conflict',
          status,
          detail: 'Проверьте форму',
          instance: '/api/owner/meeting-types',
          code:
            status === 400
              ? 'VALIDATION_ERROR'
              : 'MEETING_TYPE_NAME_CONFLICT',
          errors: [{ path: 'name', message: 'Проверьте название' }],
        },
        data: undefined,
        request: meetingTypesRequest,
        response: new Response(null, { status }),
      })
      renderApp('/owner/meeting-types')
      expect(
        await screen.findByText('Типы встреч пока не созданы'),
      ).toBeInTheDocument()

      await user.type(screen.getByLabelText('Название'), 'Черновик')
      await user.type(screen.getByLabelText('Описание'), 'Не потерять')
      await user.type(screen.getByLabelText('Длительность (минуты)'), '45')
      await user.click(screen.getByRole('button', { name: 'Создать тип' }))

      expect(await screen.findByText('Проверьте название')).toBeInTheDocument()
      expect(screen.getByLabelText('Название')).toHaveValue('Черновик')
      expect(screen.getByLabelText('Описание')).toHaveValue('Не потерять')
      expect(screen.getByLabelText('Длительность (минуты)')).toHaveValue(45)
      expect(screen.queryByText('Тип встречи создан')).not.toBeInTheDocument()
    },
  )

  it('сохраняет форму и предлагает повтор после сбоя создания', async () => {
    const user = userEvent.setup()
    createMeetingTypeMock.mockRejectedValueOnce(new Error('network'))
    renderApp('/owner/meeting-types')
    expect(
      await screen.findByText('Типы встреч пока не созданы'),
    ).toBeInTheDocument()
    await user.type(screen.getByLabelText('Название'), 'Черновик')
    await user.type(screen.getByLabelText('Описание'), 'Описание')
    await user.type(screen.getByLabelText('Длительность (минуты)'), '30')

    await user.click(screen.getByRole('button', { name: 'Создать тип' }))

    expect(
      await screen.findByText(
        'Не удалось создать тип встречи. Попробуйте ещё раз',
      ),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Название')).toHaveValue('Черновик')
    expect(screen.getByLabelText('Описание')).toHaveValue('Описание')
    expect(screen.getByRole('button', { name: 'Создать тип' })).toBeEnabled()
  })

  it('блокирует повторную отправку во время создания', async () => {
    const user = userEvent.setup()
    const pendingRequest = new Promise<{
      data: MeetingType
      request: Request
      response: Response
    }>(() => {})
    createMeetingTypeMock.mockReturnValue(pendingRequest)
    renderApp('/owner/meeting-types')
    expect(
      await screen.findByText('Типы встреч пока не созданы'),
    ).toBeInTheDocument()
    await user.type(screen.getByLabelText('Название'), 'Тип')
    await user.type(screen.getByLabelText('Описание'), 'Описание')
    await user.type(screen.getByLabelText('Длительность (минуты)'), '30')

    await user.click(screen.getByRole('button', { name: 'Создать тип' }))

    const submitButton = screen.getByRole('button', { name: 'Создание…' })
    expect(submitButton).toBeDisabled()
    await user.click(submitButton)
    expect(createMeetingTypeMock).toHaveBeenCalledTimes(1)
  })

  it('позволяет повторить неудачную загрузку', async () => {
    const user = userEvent.setup()
    listMeetingTypesMock.mockRejectedValueOnce(new Error('network'))
    renderApp('/owner/meeting-types')

    expect(
      await screen.findByText('Не удалось загрузить типы встреч'),
    ).toBeInTheDocument()
    expect(
      screen.queryByText('Типы встреч пока не созданы'),
    ).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Повторить' }))

    expect(
      await screen.findByText('Типы встреч пока не созданы'),
    ).toBeInTheDocument()
    expect(listMeetingTypesMock).toHaveBeenCalledTimes(2)
  })

  it('показывает загрузку и пустой список', async () => {
    renderApp('/owner/meeting-types')

    expect(screen.getByText('Загрузка…')).toBeInTheDocument()
    expect(
      await screen.findByText('Типы встреч пока не созданы'),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Создать тип' }),
    ).toBeInTheDocument()
  })
})

describe('Доступность владельца', () => {
  it('редактирует интервалы единым черновиком и обновляет текущую версию', async () => {
    const user = userEvent.setup()
    const initialTemplate: WeeklyTemplate = {
      ...emptyWeeklyTemplate,
      MONDAY: [{ start: '09:03', end: '10:17' }],
    }
    const updatedTemplate: WeeklyTemplate = {
      ...emptyWeeklyTemplate,
      MONDAY: [
        { start: '09:03', end: '10:17' },
        { start: '10:17', end: '11:19' },
      ],
    }
    getAvailabilityMock.mockResolvedValue({
      data: {
        exists: true,
        timeZone: 'Europe/Moscow',
        version: 4,
        weeklyTemplate: initialTemplate,
      },
      request: availabilityRequest,
      response: new Response(null, { status: 200 }),
    })
    replaceAvailabilityMock.mockResolvedValue({
      data: {
        exists: true,
        timeZone: 'Europe/Moscow',
        version: 5,
        weeklyTemplate: updatedTemplate,
      },
      request: availabilityRequest,
      response: new Response(null, { status: 200 }),
    })
    renderApp('/owner/availability')
    expect(
      await screen.findByDisplayValue('09:03'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Сохранить' })).toBeDisabled()

    await user.click(
      screen.getByRole('button', { name: 'Добавить интервал — Понедельник' }),
    )
    await user.type(screen.getByLabelText('Понедельник: начало 2'), '10:17')
    await user.type(screen.getByLabelText('Понедельник: окончание 2'), '11:19')

    expect(replaceAvailabilityMock).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Сохранить' }))

    expect(replaceAvailabilityMock).toHaveBeenCalledWith({
      body: {
        timeZone: 'Europe/Moscow',
        expectedVersion: 4,
        weeklyTemplate: updatedTemplate,
        exceptions: [],
      },
    })
    expect(await screen.findByText('Доступность сохранена')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Сохранить' })).toBeDisabled()
  })

  it('восстанавливает сохранённый черновик только после подтверждения', async () => {
    const user = userEvent.setup()
    getAvailabilityMock.mockResolvedValue({
      data: {
        exists: true,
        timeZone: 'Europe/Moscow',
        version: 2,
        weeklyTemplate: {
          ...emptyWeeklyTemplate,
          MONDAY: [{ start: '09:03', end: '10:17' }],
        },
      },
      request: availabilityRequest,
      response: new Response(null, { status: 200 }),
    })
    const confirmMock = vi
      .spyOn(window, 'confirm')
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true)
    renderApp('/owner/availability')
    expect(await screen.findByDisplayValue('09:03')).toBeInTheDocument()
    await user.click(
      screen.getByRole('button', { name: 'Добавить интервал — Понедельник' }),
    )

    const cancelButton = screen.getByRole('button', {
      name: 'Отменить изменения',
    })
    expect(cancelButton).toBeEnabled()
    await user.click(cancelButton)
    expect(screen.getByLabelText('Понедельник: начало 2')).toBeInTheDocument()

    await user.click(cancelButton)

    expect(confirmMock).toHaveBeenCalledTimes(2)
    expect(
      screen.queryByLabelText('Понедельник: начало 2'),
    ).not.toBeInTheDocument()
    expect(screen.getByLabelText('Понедельник: начало 1')).toHaveValue('09:03')
    expect(screen.getByRole('button', { name: 'Сохранить' })).toBeDisabled()
  })

  it('повторяет первоначальную загрузку без показа формы создания', async () => {
    const user = userEvent.setup()
    getAvailabilityMock.mockRejectedValueOnce(new Error('network'))
    renderApp('/owner/availability')

    expect(
      await screen.findByText('Не удалось загрузить доступность'),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Сохранить' }),
    ).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Повторить' }))

    expect(await screen.findByLabelText('Часовой пояс')).toBeInTheDocument()
    expect(getAvailabilityMock).toHaveBeenCalledTimes(2)
  })

  it('сохраняет черновик и позволяет повторить после сбоя сохранения', async () => {
    const user = userEvent.setup()
    replaceAvailabilityMock
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValue({
        data: {
          exists: true,
          timeZone: 'Europe/Moscow',
          version: 1,
          weeklyTemplate: {
            ...emptyWeeklyTemplate,
            MONDAY: [{ start: '09:01', end: '10:02' }],
          },
        },
        request: availabilityRequest,
        response: new Response(null, { status: 200 }),
      })
    renderApp('/owner/availability')
    expect(await screen.findByLabelText('Часовой пояс')).toBeInTheDocument()
    await user.click(
      screen.getByRole('button', { name: 'Добавить интервал — Понедельник' }),
    )
    await user.type(screen.getByLabelText('Понедельник: начало 1'), '09:01')
    await user.type(screen.getByLabelText('Понедельник: окончание 1'), '10:02')

    await user.click(screen.getByRole('button', { name: 'Сохранить' }))

    expect(
      await screen.findByText(
        'Не удалось сохранить доступность. Попробуйте ещё раз',
      ),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Понедельник: начало 1')).toHaveValue('09:01')
    expect(screen.getByLabelText('Понедельник: окончание 1')).toHaveValue('10:02')
    expect(screen.getByRole('button', { name: 'Сохранить' })).toBeEnabled()

    await user.click(screen.getByRole('button', { name: 'Сохранить' }))
    expect(await screen.findByText('Доступность сохранена')).toBeInTheDocument()
    expect(replaceAvailabilityMock).toHaveBeenCalledTimes(2)
  })

  it('проверяет все интервалы после сохранения и не отправляет невалидный черновик', async () => {
    const user = userEvent.setup()
    renderApp('/owner/availability')
    expect(await screen.findByLabelText('Часовой пояс')).toBeInTheDocument()
    await user.click(
      screen.getByRole('button', { name: 'Добавить интервал — Понедельник' }),
    )
    await user.type(screen.getByLabelText('Понедельник: начало 1'), '10:00')
    await user.type(screen.getByLabelText('Понедельник: окончание 1'), '09:00')
    await user.click(
      screen.getByRole('button', { name: 'Добавить интервал — Вторник' }),
    )
    await user.type(screen.getByLabelText('Вторник: начало 1'), '09:00')
    await user.type(screen.getByLabelText('Вторник: окончание 1'), '10:00')
    await user.click(
      screen.getByRole('button', { name: 'Добавить интервал — Вторник' }),
    )
    await user.type(screen.getByLabelText('Вторник: начало 2'), '09:30')
    await user.type(screen.getByLabelText('Вторник: окончание 2'), '11:00')

    await user.click(screen.getByRole('button', { name: 'Сохранить' }))

    expect(
      await screen.findByText('Окончание должно быть позже начала'),
    ).toBeInTheDocument()
    expect(screen.getByText('Интервалы не должны пересекаться')).toBeInTheDocument()
    expect(replaceAvailabilityMock).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Вторник: начало 2')).toHaveValue('09:30')
  })

  it('сохраняет черновик при конфликте версии и перезагружает его только с подтверждением', async () => {
    const user = userEvent.setup()
    getAvailabilityMock
      .mockResolvedValueOnce({
        data: {
          exists: true,
          timeZone: 'Europe/Moscow',
          version: 3,
          weeklyTemplate: {
            ...emptyWeeklyTemplate,
            MONDAY: [{ start: '09:03', end: '10:17' }],
          },
          exceptions: [
            { date: '2099-12-01', type: 'CLOSED', intervals: [] },
          ],
        },
        request: availabilityRequest,
        response: new Response(null, { status: 200 }),
      })
      .mockResolvedValueOnce({
        data: {
          exists: true,
          timeZone: 'Europe/Moscow',
          version: 4,
          weeklyTemplate: {
            ...emptyWeeklyTemplate,
            MONDAY: [{ start: '12:00', end: '13:00' }],
          },
          exceptions: [
            { date: '2099-12-03', type: 'CLOSED', intervals: [] },
          ],
        },
        request: availabilityRequest,
        response: new Response(null, { status: 200 }),
      })
    replaceAvailabilityMock.mockResolvedValue({
      error: {
        type: 'about:blank',
        title: 'Conflict',
        status: 409,
        detail: 'Расписание изменилось',
        instance: '/api/owner/availability',
        code: 'AVAILABILITY_VERSION_CONFLICT',
      },
      data: undefined,
      request: availabilityRequest,
      response: new Response(null, { status: 409 }),
    })
    const confirmMock = vi
      .spyOn(window, 'confirm')
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true)
    renderApp('/owner/availability')
    const startInput = await screen.findByLabelText('Понедельник: начало 1')
    await user.clear(startInput)
    await user.type(startInput, '09:04')
    fireEvent.change(screen.getByLabelText('Дата исключения 1'), {
      target: { value: '2099-12-02' },
    })
    await user.click(screen.getByRole('button', { name: 'Сохранить' }))

    expect(
      await screen.findByText(
        'Расписание изменилось в другой вкладке. Загрузите актуальную версию',
      ),
    ).toBeInTheDocument()
    const reloadButton = screen.getByRole('button', {
      name: 'Загрузить актуальную версию',
    })
    await user.click(reloadButton)
    expect(getAvailabilityMock).toHaveBeenCalledTimes(1)
    expect(screen.getByLabelText('Понедельник: начало 1')).toHaveValue('09:04')
    expect(screen.getByLabelText('Дата исключения 1')).toHaveValue('2099-12-02')

    await user.click(reloadButton)

    expect(confirmMock).toHaveBeenCalledTimes(2)
    expect(await screen.findByDisplayValue('12:00')).toBeInTheDocument()
    expect(screen.getByLabelText('Дата исключения 1')).toHaveValue('2099-12-03')
    expect(getAvailabilityMock).toHaveBeenCalledTimes(2)
    expect(screen.getByRole('button', { name: 'Сохранить' })).toBeDisabled()
  })

  it('предупреждает о потере черновика при уходе со страницы', async () => {
    const user = userEvent.setup()
    const confirmMock = vi
      .spyOn(window, 'confirm')
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true)
    renderApp('/owner/availability')
    expect(await screen.findByLabelText('Часовой пояс')).toBeInTheDocument()
    await user.click(
      screen.getByRole('button', { name: 'Добавить интервал — Понедельник' }),
    )

    const beforeUnload = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(beforeUnload)
    expect(beforeUnload.defaultPrevented).toBe(true)

    await user.click(screen.getByRole('link', { name: 'Типы встреч' }))
    expect(
      screen.getByRole('heading', { name: 'Доступность' }),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('link', { name: 'Типы встреч' }))

    expect(confirmMock).toHaveBeenCalledTimes(2)
    expect(
      await screen.findByRole('heading', { name: 'Типы встреч' }),
    ).toBeInTheDocument()
  })

  it('предупреждает о потере черновика при браузерном back/forward', async () => {
    const user = userEvent.setup()
    const confirmMock = vi
      .spyOn(window, 'confirm')
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true)
    const router = createMemoryRouter([{ path: '*', element: <App /> }], {
      initialEntries: ['/owner', '/owner/availability'],
      initialIndex: 1,
    })
    render(<RouterProvider router={router} />)
    expect(await screen.findByLabelText('Часовой пояс')).toBeInTheDocument()
    await user.click(
      screen.getByRole('button', { name: 'Добавить интервал — Понедельник' }),
    )

    await act(() => router.navigate(-1))

    expect(confirmMock).toHaveBeenCalledTimes(1)
    expect(
      screen.getByRole('heading', { name: 'Доступность' }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Понедельник: начало 1')).toBeInTheDocument()

    await act(() => router.navigate(-1))

    expect(confirmMock).toHaveBeenCalledTimes(2)
    expect(
      await screen.findByRole('heading', { name: 'Встречи', level: 1 }),
    ).toBeInTheDocument()
  })

  it('удаляет строку только из черновика', async () => {
    const user = userEvent.setup()
    getAvailabilityMock.mockResolvedValue({
      data: {
        exists: true,
        timeZone: 'Europe/Moscow',
        version: 2,
        weeklyTemplate: {
          ...emptyWeeklyTemplate,
          MONDAY: [
            { start: '09:00', end: '10:00' },
            { start: '10:00', end: '11:00' },
          ],
        },
      },
      request: availabilityRequest,
      response: new Response(null, { status: 200 }),
    })
    renderApp('/owner/availability')
    expect(await screen.findByDisplayValue('09:00')).toBeInTheDocument()

    await user.click(
      screen.getByRole('button', { name: 'Удалить интервал 1 — Понедельник' }),
    )

    expect(screen.queryByDisplayValue('09:00')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Понедельник: начало 1')).toHaveValue('10:00')
    expect(replaceAvailabilityMock).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Сохранить' })).toBeEnabled()
  })

  it('показывает серверные ошибки у полей без потери черновика', async () => {
    const user = userEvent.setup()
    replaceAvailabilityMock.mockResolvedValue({
      error: {
        type: 'about:blank',
        title: 'Bad Request',
        status: 400,
        detail: 'Проверьте значения полей',
        instance: '/api/owner/availability',
        code: 'VALIDATION_ERROR',
        errors: [
          {
            path: 'weeklyTemplate.MONDAY[0].start',
            message: 'Серверная ошибка времени',
          },
        ],
      },
      data: undefined,
      request: availabilityRequest,
      response: new Response(null, { status: 400 }),
    })
    renderApp('/owner/availability')
    expect(await screen.findByLabelText('Часовой пояс')).toBeInTheDocument()
    await user.click(
      screen.getByRole('button', { name: 'Добавить интервал — Понедельник' }),
    )
    await user.type(screen.getByLabelText('Понедельник: начало 1'), '09:01')
    await user.type(screen.getByLabelText('Понедельник: окончание 1'), '10:02')
    await user.click(screen.getByRole('button', { name: 'Сохранить' }))

    expect(
      await screen.findByText('Серверная ошибка времени'),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Понедельник: начало 1')).toHaveValue('09:01')
    expect(screen.getByRole('button', { name: 'Сохранить' })).toBeEnabled()
  })

  it('блокирует повторное сохранение во время запроса', async () => {
    const user = userEvent.setup()
    const pendingRequest = new Promise<{
      data: Availability
      request: Request
      response: Response
    }>(() => {})
    replaceAvailabilityMock.mockReturnValue(pendingRequest)
    renderApp('/owner/availability')
    expect(await screen.findByLabelText('Часовой пояс')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Сохранить' }))

    const saveButton = screen.getByRole('button', { name: 'Сохранение…' })
    expect(saveButton).toBeDisabled()
    await user.click(saveButton)
    expect(replaceAvailabilityMock).toHaveBeenCalledTimes(1)
  })

  it('создаёт пустой шаблон без предварительных изменений', async () => {
    const user = userEvent.setup()
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
    replaceAvailabilityMock.mockResolvedValue({
      data: {
        exists: true,
        timeZone,
        version: 1,
        weeklyTemplate: emptyWeeklyTemplate,
      },
      request: availabilityRequest,
      response: new Response(null, { status: 200 }),
    })
    renderApp('/owner/availability')

    expect(
      await screen.findByRole('heading', { name: 'Доступность' }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Часовой пояс')).toHaveValue(timeZone)
    expect(screen.getAllByText('Интервалы не заданы')).toHaveLength(7)
    expect(screen.getByRole('button', { name: 'Сохранить' })).toBeEnabled()
    expect(
      screen.getByRole('button', { name: 'Отменить изменения' }),
    ).toBeDisabled()
    expect(replaceAvailabilityMock).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Сохранить' }))

    expect(await screen.findByText('Доступность сохранена')).toBeInTheDocument()
    expect(replaceAvailabilityMock).toHaveBeenCalledWith({
      body: {
        timeZone,
        expectedVersion: null,
        weeklyTemplate: emptyWeeklyTemplate,
        exceptions: [],
      },
    })
    expect(screen.getByLabelText('Часовой пояс')).toHaveAttribute('readonly')
    expect(screen.getByRole('button', { name: 'Сохранить' })).toBeDisabled()
    expect(
      screen.getByRole('button', { name: 'Отменить изменения' }),
    ).toBeDisabled()
  })

  it('отменяет удаление исключения и сохраняет его удаление после сбоя для повтора', async () => {
    const user = userEvent.setup()
    const savedException = {
      date: '2099-12-01',
      type: 'CLOSED' as const,
      intervals: [],
    }
    getAvailabilityMock.mockResolvedValue({
      data: {
        exists: true,
        timeZone: 'Europe/Moscow',
        version: 2,
        weeklyTemplate: emptyWeeklyTemplate,
        exceptions: [savedException],
      },
      request: availabilityRequest,
      response: new Response(null, { status: 200 }),
    })
    replaceAvailabilityMock
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValue({
        data: {
          exists: true,
          timeZone: 'Europe/Moscow',
          version: 3,
          weeklyTemplate: emptyWeeklyTemplate,
          exceptions: [],
        },
        request: availabilityRequest,
        response: new Response(null, { status: 200 }),
      })
    const confirmMock = vi
      .spyOn(window, 'confirm')
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true)
    renderApp('/owner/availability')

    expect(await screen.findByDisplayValue('2099-12-01')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Удалить исключение 1' }))
    expect(screen.getByText('Исключений нет')).toBeInTheDocument()
    expect(replaceAvailabilityMock).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Отменить изменения' }))
    expect(screen.queryByDisplayValue('2099-12-01')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Отменить изменения' }))
    expect(confirmMock).toHaveBeenCalledTimes(2)
    expect(screen.getByDisplayValue('2099-12-01')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Удалить исключение 1' }))
    await user.click(screen.getByRole('button', { name: 'Сохранить' }))
    expect(
      await screen.findByText('Не удалось сохранить доступность. Попробуйте ещё раз'),
    ).toBeInTheDocument()
    expect(screen.getByText('Исключений нет')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Сохранить' })).toBeEnabled()

    await user.click(screen.getByRole('button', { name: 'Сохранить' }))
    expect(await screen.findByText('Доступность сохранена')).toBeInTheDocument()
    expect(replaceAvailabilityMock).toHaveBeenCalledTimes(2)
    expect(replaceAvailabilityMock).toHaveBeenLastCalledWith({
      body: {
        timeZone: 'Europe/Moscow',
        expectedVersion: 2,
        weeklyTemplate: emptyWeeklyTemplate,
        exceptions: [],
      },
    })
    expect(screen.getByRole('button', { name: 'Сохранить' })).toBeDisabled()
  })

  it('проверяет даты и интервалы исключений после нажатия сохранения', async () => {
    const user = userEvent.setup()
    renderApp('/owner/availability')
    expect(await screen.findByText('Исключений нет')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Добавить исключение' }))
    fireEvent.change(screen.getByLabelText('Дата исключения 1'), {
      target: { value: '2000-01-01' },
    })

    await user.click(screen.getByRole('button', { name: 'Сохранить' }))

    expect(
      await screen.findByText('Дата исключения не может быть в прошлом'),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Дата исключения 1')).toHaveValue('2000-01-01')
    expect(replaceAvailabilityMock).not.toHaveBeenCalled()

    fireEvent.change(screen.getByLabelText('Дата исключения 1'), {
      target: { value: '2099-12-02' },
    })
    await user.selectOptions(screen.getByLabelText('Тип исключения 1'), 'CUSTOM')
    await user.click(screen.getByRole('button', { name: 'Сохранить' }))

    expect(
      await screen.findByText('Особое расписание требует хотя бы один интервал'),
    ).toBeInTheDocument()
    expect(replaceAvailabilityMock).not.toHaveBeenCalled()

    await user.click(
      screen.getByRole('button', { name: 'Добавить интервал — исключение 1' }),
    )
    await user.type(screen.getByLabelText('Исключение 1: начало 1'), '09:00')
    await user.type(screen.getByLabelText('Исключение 1: окончание 1'), '10:00')
    await user.click(
      screen.getByRole('button', { name: 'Добавить интервал — исключение 1' }),
    )
    await user.type(screen.getByLabelText('Исключение 1: начало 2'), '09:30')
    await user.type(screen.getByLabelText('Исключение 1: окончание 2'), '11:00')
    await user.click(screen.getByRole('button', { name: 'Сохранить' }))

    expect(
      await screen.findByText('Интервалы не должны пересекаться'),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Исключение 1: начало 2')).toHaveValue('09:30')
    expect(replaceAvailabilityMock).not.toHaveBeenCalled()
  })

  it('не отправляет исключения с повторяющейся датой', async () => {
    const user = userEvent.setup()
    renderApp('/owner/availability')
    expect(await screen.findByText('Исключений нет')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Добавить исключение' }))
    await user.click(screen.getByRole('button', { name: 'Добавить исключение' }))

    await user.click(screen.getByRole('button', { name: 'Сохранить' }))

    expect(
      await screen.findByText('Исключение для этой даты уже добавлено'),
    ).toBeInTheDocument()
    expect(replaceAvailabilityMock).not.toHaveBeenCalled()
  })

  it('сохраняет закрытую и особую даты одним черновиком с шаблоном', async () => {
    const user = userEvent.setup()
    const exceptions = [
      { date: '2099-12-01', type: 'CLOSED' as const, intervals: [] },
      {
        date: '2099-12-02',
        type: 'CUSTOM' as const,
        intervals: [{ start: '11:03', end: '12:17' }],
      },
    ]
    getAvailabilityMock.mockResolvedValue({
      data: {
        exists: true,
        timeZone: 'Europe/Moscow',
        version: 4,
        weeklyTemplate: emptyWeeklyTemplate,
        exceptions: [],
      },
      request: availabilityRequest,
      response: new Response(null, { status: 200 }),
    })
    replaceAvailabilityMock.mockResolvedValue({
      data: {
        exists: true,
        timeZone: 'Europe/Moscow',
        version: 5,
        weeklyTemplate: emptyWeeklyTemplate,
        exceptions,
      },
      request: availabilityRequest,
      response: new Response(null, { status: 200 }),
    })
    renderApp('/owner/availability')

    expect(await screen.findByText('Исключений нет')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Добавить исключение' }))
    fireEvent.change(screen.getByLabelText('Дата исключения 1'), {
      target: { value: '2099-12-02' },
    })
    await user.selectOptions(screen.getByLabelText('Тип исключения 1'), 'CUSTOM')
    await user.click(
      screen.getByRole('button', { name: 'Добавить интервал — исключение 1' }),
    )
    await user.type(screen.getByLabelText('Исключение 1: начало 1'), '11:03')
    await user.type(screen.getByLabelText('Исключение 1: окончание 1'), '12:17')
    await user.click(screen.getByRole('button', { name: 'Добавить исключение' }))
    fireEvent.change(screen.getByLabelText('Дата исключения 1'), {
      target: { value: '2099-12-01' },
    })

    expect(screen.getByText('День закрыт')).toBeInTheDocument()
    expect(replaceAvailabilityMock).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Сохранить' }))

    expect(replaceAvailabilityMock).toHaveBeenCalledWith({
      body: {
        timeZone: 'Europe/Moscow',
        expectedVersion: 4,
        weeklyTemplate: emptyWeeklyTemplate,
        exceptions,
      },
    })
    expect(await screen.findByText('Доступность сохранена')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Сохранить' })).toBeDisabled()
  })
})

describe('Страница владельца', () => {
  it('позволяет вернуться на главную', async () => {
    const user = userEvent.setup()
    renderApp('/owner')

    expect(
      screen.getByRole('heading', { name: 'Встречи', level: 1 }),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('link', { name: 'Календарь звонков' }))

    expect(
      await screen.findByRole('heading', {
        name: 'Забронируйте встречу без регистрации',
      }),
    ).toBeInTheDocument()
  })
})

describe('Неизвестный адрес', () => {
  it('показывает страницу 404 и позволяет вернуться на главную', async () => {
    const user = userEvent.setup()
    renderApp('/unknown')

    expect(
      screen.getByRole('heading', { name: 'Страница не найдена' }),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('link', { name: 'На главную' }))

    expect(
      await screen.findByRole('heading', {
        name: 'Забронируйте встречу без регистрации',
      }),
    ).toBeInTheDocument()
  })
})


describe('Гостевой выбор встречи', () => {
  it('различает загрузку и отсутствие доступных встреч', async () => {
    renderApp('/book')

    expect(screen.getByText('Загрузка…')).toBeInTheDocument()
    expect(
      await screen.findByText('Нет доступных встреч для бронирования'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Повторить' })).not.toBeInTheDocument()
  })

  it('выбирает ближайший день и слот, сбрасывает выбор и показывает занятое время', async () => {
    const user = userEvent.setup()
    const types = [bookingType('type-1', 'Консультация'), bookingType('type-2', 'Разбор')]
    const availability = bookingAvailability()
    availability.days[2].slots.push({
      startsAt: '2026-11-15T11:00:00Z',
      endsAt: '2026-11-15T11:45:00Z',
      status: 'TOO_SOON',
    })
    availability.days[2].busyIntervals.push({
      startsAt: '2026-11-15T12:00:00Z',
      endsAt: '2026-11-15T13:00:00Z',
    })
    listBookingMeetingTypesMock.mockResolvedValue({
      data: types,
      request: bookingTypesRequest,
      response: new Response(null, { status: 200 }),
    })
    getBookingAvailabilityMock.mockResolvedValue({
      data: availability,
      request: bookingAvailabilityRequest,
      response: new Response(null, { status: 200 }),
    })
    renderApp('/book')

    await user.click(await screen.findByRole('button', { name: /Консультация/ }))

    expect(await screen.findAllByRole('button', { name: /2026/ })).toHaveLength(14)
    expect(screen.getByRole('button', { name: /13 ноября 2026/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /15 ноября 2026/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByText(/Часовой пояс:/)).toBeInTheDocument()
    expect(screen.getByText(/Занято:/)).toBeInTheDocument()
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
    const slotTime = new Intl.DateTimeFormat('ru-RU', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone,
    }).format(new Date('2026-11-15T10:00:00Z'))
    const availableSlot = screen.getByRole('button', { name: slotTime })
    await user.click(availableSlot)
    expect(availableSlot).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText(/Выбрано:/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /16 ноября 2026/ }))
    expect(screen.queryByText(/Выбрано:/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /16 ноября 2026/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    )

    await user.click(screen.getByRole('button', { name: 'Выбрать другой тип' }))
    await user.click(screen.getByRole('button', { name: /Разбор/ }))
    expect(await screen.findAllByRole('button', { name: /2026/ })).toHaveLength(14)
    expect(screen.queryByText(/Выбрано:/)).not.toBeInTheDocument()
    expect(getBookingAvailabilityMock).toHaveBeenCalledTimes(2)
    expect(getBookingAvailabilityMock).toHaveBeenLastCalledWith({
      path: { id: 'type-2' },
      query: { timeZone },
    })
  }, 15_000)

  it('повторяет неудачную загрузку типов', async () => {
    const user = userEvent.setup()
    listBookingMeetingTypesMock.mockRejectedValueOnce(new Error('network'))
    listBookingMeetingTypesMock.mockResolvedValueOnce({
      data: [bookingType('type-1', 'Консультация')],
      request: bookingTypesRequest,
      response: new Response(null, { status: 200 }),
    })
    renderApp('/book')

    expect(
      await screen.findByText('Не удалось загрузить доступные встречи'),
    ).toBeInTheDocument()
    expect(screen.queryByText('Нет доступных встреч для бронирования')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Повторить' }))

    expect(await screen.findByRole('button', { name: /Консультация/ })).toBeInTheDocument()
    expect(listBookingMeetingTypesMock).toHaveBeenCalledTimes(2)
  })

  it('повторяет неудачную загрузку доступности без потери выбранного типа', async () => {
    const user = userEvent.setup()
    listBookingMeetingTypesMock.mockResolvedValue({
      data: [bookingType('type-1', 'Консультация')],
      request: bookingTypesRequest,
      response: new Response(null, { status: 200 }),
    })
    getBookingAvailabilityMock.mockRejectedValueOnce(new Error('network'))
    getBookingAvailabilityMock.mockResolvedValueOnce({
      data: bookingAvailability(),
      request: bookingAvailabilityRequest,
      response: new Response(null, { status: 200 }),
    })
    renderApp('/book')

    await user.click(await screen.findByRole('button', { name: /Консультация/ }))
    expect(await screen.findByText('Не удалось загрузить доступность')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Повторить' }))

    expect(await screen.findAllByRole('button', { name: /2026/ })).toHaveLength(14)
    expect(screen.getByRole('heading', { name: 'Консультация' })).toBeInTheDocument()
    expect(getBookingAvailabilityMock).toHaveBeenCalledTimes(2)
  })

  it('показывает все дни заблокированными, если свободных слотов не осталось', async () => {
    const user = userEvent.setup()
    const availability = bookingAvailability()
    availability.days = availability.days.map((day) => ({
      ...day,
      hasAvailableSlots: false,
      slots: [],
    }))
    listBookingMeetingTypesMock.mockResolvedValue({
      data: [bookingType('type-1', 'Консультация')],
      request: bookingTypesRequest,
      response: new Response(null, { status: 200 }),
    })
    getBookingAvailabilityMock.mockResolvedValue({
      data: availability,
      request: bookingAvailabilityRequest,
      response: new Response(null, { status: 200 }),
    })
    renderApp('/book')

    await user.click(await screen.findByRole('button', { name: /Консультация/ }))

    expect(
      await screen.findByText('Для этой встречи нет свободных слотов'),
    ).toBeInTheDocument()
    const dates = screen.getAllByRole('button', { name: /2026/ })
    expect(dates).toHaveLength(14)
    dates.forEach((date) => expect(date).toBeDisabled())
  })
})

describe('Гостевое бронирование', () => {
  it('показывает сводку, отправляет только данные гостя и подтверждает встречу', async () => {
    const user = userEvent.setup()
    const meetingType = bookingType('type-1', 'Консультация')
    const startsAt = '2026-11-15T10:00:00Z'
    const meeting: Meeting = {
      id: 'meeting-1',
      meetingTypeId: meetingType.id,
      startsAt,
      endsAt: '2026-11-15T10:45:00Z',
      guestName: 'Иван Петров',
      guestEmail: 'ivan@example.com',
      createdAt: '2026-11-13T09:00:00Z',
      status: 'SCHEDULED',
      meetingType,
    }
    listBookingMeetingTypesMock.mockResolvedValue({
      data: [meetingType],
      request: bookingTypesRequest,
      response: new Response(null, { status: 200 }),
    })
    getBookingAvailabilityMock.mockResolvedValue({
      data: bookingAvailability(),
      request: bookingAvailabilityRequest,
      response: new Response(null, { status: 200 }),
    })
    createBookingMock.mockResolvedValue({
      data: meeting,
      request: createBookingRequest,
      response: new Response(null, { status: 201 }),
    })
    renderApp('/book')

    expect(
      screen.getByRole('navigation', { name: 'Шаги бронирования' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Тип встречи', { selector: 'li' })).toHaveAttribute(
      'aria-current',
      'step',
    )
    await user.click(await screen.findByRole('button', { name: /Консультация/ }))
    expect(screen.getByText('Дата и время', { selector: 'li' })).toHaveAttribute(
      'aria-current',
      'step',
    )
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
    const slotTime = new Intl.DateTimeFormat('ru-RU', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone,
    }).format(new Date(startsAt))
    await user.click(await screen.findByRole('button', { name: slotTime }))

    expect(screen.getByText('Данные гостя', { selector: 'li' })).toHaveAttribute(
      'aria-current',
      'step',
    )
    const summary = screen.getByRole('region', { name: 'Сводка встречи' })
    expect(summary).toHaveTextContent('Консультация')
    expect(summary).toHaveTextContent('15 ноября 2026')
    expect(summary).toHaveTextContent('45 мин')
    expect(summary).toHaveTextContent(timeZone)
    await user.type(screen.getByLabelText('Имя'), '  Иван Петров  ')
    await user.type(screen.getByLabelText('Email'), '  ivan@example.com  ')
    await user.click(screen.getByRole('button', { name: 'Забронировать' }))

    expect(createBookingMock).toHaveBeenCalledWith({
      body: {
        meetingTypeId: 'type-1',
        startsAt,
        guestName: 'Иван Петров',
        guestEmail: 'ivan@example.com',
      },
    })
    expect(await screen.findByText('Встреча забронирована')).toBeInTheDocument()
    expect(screen.getByText('Подтверждение', { selector: 'li' })).toHaveAttribute(
      'aria-current',
      'step',
    )
    expect(screen.getByRole('region', { name: 'Сводка встречи' })).toHaveTextContent(
      'Консультация',
    )
    expect(
      screen.getByRole('button', { name: 'Забронировать ещё одну встречу' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'На главную' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Имя')).not.toBeInTheDocument()
  })

  it('блокирует повторную отправку и сохраняет форму для повтора после сбоя', async () => {
    const user = userEvent.setup()
    const meetingType = mockBookingSelection()
    let rejectRequest: (reason: Error) => void = () => {}
    createBookingMock
      .mockImplementationOnce(
        () =>
          new Promise<never>((_, reject) => {
            rejectRequest = reject
          }),
      )
      .mockResolvedValueOnce({
        data: createdMeeting(meetingType),
        request: createBookingRequest,
        response: new Response(null, { status: 201 }),
      })
    renderApp('/book')
    await openBookingForm(user)
    await user.type(screen.getByLabelText('Имя'), 'Иван Петров')
    await user.type(screen.getByLabelText('Email'), 'ivan@example.com')

    const submit = screen.getByRole('button', { name: 'Забронировать' })
    await user.click(submit)
    expect(submit).toBeDisabled()
    await user.click(submit)
    expect(createBookingMock).toHaveBeenCalledTimes(1)
    rejectRequest(new Error('network'))

    expect(
      await screen.findByText('Не удалось забронировать встречу. Попробуйте ещё раз'),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Имя')).toHaveValue('Иван Петров')
    expect(screen.getByLabelText('Email')).toHaveValue('ivan@example.com')
    expect(screen.getByRole('region', { name: 'Сводка встречи' })).toBeInTheDocument()
    expect(submit).toBeEnabled()

    await user.click(submit)
    expect(await screen.findByText('Встреча забронирована')).toBeInTheDocument()
    expect(createBookingMock).toHaveBeenCalledTimes(2)
  })

  it('показывает ошибки у полей и не отправляет невалидные данные', async () => {
    const user = userEvent.setup()
    mockBookingSelection()
    renderApp('/book')
    await openBookingForm(user)

    await user.click(screen.getByRole('button', { name: 'Забронировать' }))
    expect(await screen.findByText('Имя обязательно')).toBeInTheDocument()
    expect(screen.getByText('Email обязателен')).toBeInTheDocument()
    expect(createBookingMock).not.toHaveBeenCalled()

    await user.type(screen.getByLabelText('Имя'), 'Иван')
    await user.type(screen.getByLabelText('Email'), 'ivan@@example.com')
    await user.click(screen.getByRole('button', { name: 'Забронировать' }))
    expect(await screen.findByText('Укажите корректный email')).toBeInTheDocument()
    expect(screen.getByLabelText('Имя')).toHaveValue('Иван')
    expect(screen.getByLabelText('Email')).toHaveValue('ivan@@example.com')
    expect(createBookingMock).not.toHaveBeenCalled()
  })

  it('начинает повторное бронирование с актуальными типами и очищенной формой', async () => {
    const user = userEvent.setup()
    const meetingType = mockBookingSelection()
    createBookingMock.mockResolvedValue({
      data: createdMeeting(meetingType),
      request: createBookingRequest,
      response: new Response(null, { status: 201 }),
    })
    renderApp('/book')
    await openBookingForm(user)
    await user.type(screen.getByLabelText('Имя'), 'Иван Петров')
    await user.type(screen.getByLabelText('Email'), 'ivan@example.com')
    await user.click(screen.getByRole('button', { name: 'Забронировать' }))
    await screen.findByText('Встреча забронирована')

    await user.click(
      screen.getByRole('button', { name: 'Забронировать ещё одну встречу' }),
    )

    expect(
      await screen.findByRole('button', { name: /Консультация/ }),
    ).toBeInTheDocument()
    expect(listBookingMeetingTypesMock).toHaveBeenCalledTimes(2)
    expect(screen.queryByRole('region', { name: 'Сводка встречи' })).not.toBeInTheDocument()
    await openBookingForm(user)
    expect(screen.getByLabelText('Имя')).toHaveValue('')
    expect(screen.getByLabelText('Email')).toHaveValue('')
  })

  it('сохраняет данные гостя при возврате к слотам и смене типа', async () => {
    const user = userEvent.setup()
    const firstType = bookingType('type-1', 'Консультация')
    const secondType = bookingType('type-2', 'Разбор')
    mockBookingSelection(firstType)
    listBookingMeetingTypesMock.mockResolvedValue({
      data: [firstType, secondType],
      request: bookingTypesRequest,
      response: new Response(null, { status: 200 }),
    })
    renderApp('/book')
    await openBookingForm(user)
    await user.type(screen.getByLabelText('Имя'), 'Иван Петров')
    await user.type(screen.getByLabelText('Email'), 'ivan@example.com')

    await user.click(screen.getByRole('button', { name: 'Изменить время' }))
    expect(getBookingAvailabilityMock).toHaveBeenCalledTimes(2)
    const slotTime = new Intl.DateTimeFormat('ru-RU', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    }).format(new Date('2026-11-15T10:00:00Z'))
    await user.click(await screen.findByRole('button', { name: slotTime }))
    expect(screen.getByLabelText('Имя')).toHaveValue('Иван Петров')
    expect(screen.getByLabelText('Email')).toHaveValue('ivan@example.com')

    await user.click(screen.getByRole('button', { name: 'Выбрать другой тип' }))
    await user.click(screen.getByRole('button', { name: /Разбор/ }))
    await user.click(await screen.findByRole('button', { name: slotTime }))
    expect(screen.getByLabelText('Имя')).toHaveValue('Иван Петров')
    expect(screen.getByLabelText('Email')).toHaveValue('ivan@example.com')
  })

  it('после конфликта обновляет слоты и сохраняет тип и данные гостя', async () => {
    const user = userEvent.setup()
    mockBookingSelection()
    createBookingMock.mockResolvedValue({
      data: undefined,
      error: {
        type: 'about:blank',
        title: 'Conflict',
        status: 409,
        detail: 'Выбранное время недоступно',
        instance: '/api/booking/bookings',
        code: 'SLOT_UNAVAILABLE',
      },
      request: createBookingRequest,
      response: new Response(null, { status: 409 }),
    })
    renderApp('/book')
    await openBookingForm(user)
    await user.type(screen.getByLabelText('Имя'), 'Иван Петров')
    await user.type(screen.getByLabelText('Email'), 'ivan@example.com')
    await user.click(screen.getByRole('button', { name: 'Забронировать' }))

    expect(
      await screen.findByText('Выбранное время недоступно. Выберите другое время'),
    ).toBeInTheDocument()
    expect(getBookingAvailabilityMock).toHaveBeenCalledTimes(2)
    expect(screen.getByRole('heading', { name: 'Консультация' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Сводка встречи' })).not.toBeInTheDocument()

    const slotTime = new Intl.DateTimeFormat('ru-RU', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    }).format(new Date('2026-11-15T10:00:00Z'))
    await user.click(screen.getByRole('button', { name: slotTime }))
    expect(screen.getByLabelText('Имя')).toHaveValue('Иван Петров')
    expect(screen.getByLabelText('Email')).toHaveValue('ivan@example.com')
  })

  it('после исчерпания доступности возвращает к актуальному списку типов', async () => {
    const user = userEvent.setup()
    mockBookingSelection()
    const emptyAvailability = bookingAvailability()
    emptyAvailability.days = emptyAvailability.days.map((day) => ({
      ...day,
      hasAvailableSlots: false,
      slots: [],
    }))
    getBookingAvailabilityMock
      .mockResolvedValueOnce({
        data: bookingAvailability(),
        request: bookingAvailabilityRequest,
        response: new Response(null, { status: 200 }),
      })
      .mockResolvedValueOnce({
        data: emptyAvailability,
        request: bookingAvailabilityRequest,
        response: new Response(null, { status: 200 }),
      })
    listBookingMeetingTypesMock
      .mockResolvedValueOnce({
        data: [bookingType('type-1', 'Консультация')],
        request: bookingTypesRequest,
        response: new Response(null, { status: 200 }),
      })
      .mockResolvedValueOnce({
        data: [],
        request: bookingTypesRequest,
        response: new Response(null, { status: 200 }),
      })
    createBookingMock.mockResolvedValue({
      data: undefined,
      error: {
        type: 'about:blank',
        title: 'Conflict',
        status: 409,
        detail: 'Выбранное время недоступно',
        instance: '/api/booking/bookings',
        code: 'SLOT_UNAVAILABLE',
      },
      request: createBookingRequest,
      response: new Response(null, { status: 409 }),
    })
    renderApp('/book')
    await openBookingForm(user)
    await user.type(screen.getByLabelText('Имя'), 'Иван Петров')
    await user.type(screen.getByLabelText('Email'), 'ivan@example.com')
    await user.click(screen.getByRole('button', { name: 'Забронировать' }))

    expect(
      await screen.findByText('Выбранное время недоступно. Выберите другую встречу'),
    ).toBeInTheDocument()
    expect(screen.getByText('Нет доступных встреч для бронирования')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Консультация/ })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Имя')).not.toBeInTheDocument()
    expect(getBookingAvailabilityMock).toHaveBeenCalledTimes(2)
    expect(listBookingMeetingTypesMock).toHaveBeenCalledTimes(2)
  })

  it('показывает серверные ошибки у полей без потери выбранного слота', async () => {
    const user = userEvent.setup()
    mockBookingSelection()
    createBookingMock.mockResolvedValue({
      data: undefined,
      error: {
        type: 'about:blank',
        title: 'Bad Request',
        status: 400,
        detail: 'Проверьте значения полей',
        instance: '/api/booking/bookings',
        code: 'VALIDATION_ERROR',
        errors: [{ path: 'guestEmail', message: 'Укажите корректный email' }],
      },
      request: createBookingRequest,
      response: new Response(null, { status: 400 }),
    })
    renderApp('/book')
    await openBookingForm(user)
    await user.type(screen.getByLabelText('Имя'), 'Иван Петров')
    await user.type(screen.getByLabelText('Email'), 'ivan@example.com')
    await user.click(screen.getByRole('button', { name: 'Забронировать' }))

    expect(await screen.findByText('Укажите корректный email')).toBeInTheDocument()
    expect(screen.getByLabelText('Имя')).toHaveValue('Иван Петров')
    expect(screen.getByLabelText('Email')).toHaveValue('ivan@example.com')
    expect(screen.getByRole('region', { name: 'Сводка встречи' })).toBeInTheDocument()
    expect(
      screen.queryByText('Не удалось забронировать встречу. Попробуйте ещё раз'),
    ).not.toBeInTheDocument()
  })
})
