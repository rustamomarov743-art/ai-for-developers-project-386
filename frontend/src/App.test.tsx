import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import App from './App'

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
