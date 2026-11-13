import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createMeetingType,
  listMeetingTypes,
} from './api/generated/sdk.gen'
import type { MeetingType } from './api/generated/types.gen'
import App from './App'

vi.mock('./api/generated/sdk.gen', () => ({
  createMeetingType: vi.fn(),
  listMeetingTypes: vi.fn(),
}))

const listMeetingTypesMock = vi.mocked(listMeetingTypes)
const createMeetingTypeMock = vi.mocked(createMeetingType)
const meetingTypesRequest = new Request(
  'http://localhost:8080/api/owner/meeting-types',
)

beforeEach(() => {
  listMeetingTypesMock.mockReset()
  createMeetingTypeMock.mockReset()
  listMeetingTypesMock.mockResolvedValue({
    data: [],
    request: meetingTypesRequest,
    response: new Response(null, { status: 200 }),
  })
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
