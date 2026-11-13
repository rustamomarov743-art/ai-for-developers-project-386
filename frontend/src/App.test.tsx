import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createMeetingType,
  getAvailability,
  listMeetingTypes,
  replaceAvailability,
} from './api/generated/sdk.gen'
import type {
  Availability,
  MeetingType,
  WeeklyTemplate,
} from './api/generated/types.gen'
import App from './App'

vi.mock('./api/generated/sdk.gen', () => ({
  createMeetingType: vi.fn(),
  getAvailability: vi.fn(),
  listMeetingTypes: vi.fn(),
  replaceAvailability: vi.fn(),
}))

const listMeetingTypesMock = vi.mocked(listMeetingTypes)
const createMeetingTypeMock = vi.mocked(createMeetingType)
const getAvailabilityMock = vi.mocked(getAvailability)
const replaceAvailabilityMock = vi.mocked(replaceAvailability)
const meetingTypesRequest = new Request(
  'http://localhost:8080/api/owner/meeting-types',
)
const availabilityRequest = new Request(
  'http://localhost:8080/api/owner/availability',
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
  listMeetingTypesMock.mockReset()
  createMeetingTypeMock.mockReset()
  getAvailabilityMock.mockReset()
  replaceAvailabilityMock.mockReset()
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
})

afterEach(() => {
  vi.restoreAllMocks()
})

function renderApp(initialEntry = '/') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <App />
    </MemoryRouter>,
  )
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
      await screen.findByRole('heading', { name: 'Страница владельца' }),
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

    await user.click(reloadButton)

    expect(confirmMock).toHaveBeenCalledTimes(2)
    expect(await screen.findByDisplayValue('12:00')).toBeInTheDocument()
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
      },
    })
    expect(screen.getByLabelText('Часовой пояс')).toHaveAttribute('readonly')
    expect(screen.getByRole('button', { name: 'Сохранить' })).toBeDisabled()
    expect(
      screen.getByRole('button', { name: 'Отменить изменения' }),
    ).toBeDisabled()
  })
})

describe('Страницы-заглушки', () => {
  it.each([
    { path: '/owner', title: 'Страница владельца' },
    { path: '/book', title: 'Бронирование встречи' },
  ])(
    'позволяет вернуться на главную со страницы $path',
    async ({ path, title }) => {
      const user = userEvent.setup()
      renderApp(path)

      expect(screen.getByRole('heading', { name: title })).toBeInTheDocument()
      expect(screen.getByText('Раздел в разработке.')).toBeInTheDocument()

      await user.click(screen.getByRole('link', { name: 'На главную' }))

      expect(
        await screen.findByRole('heading', {
          name: 'Забронируйте встречу без регистрации',
        }),
      ).toBeInTheDocument()
    },
  )
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
