import { Link, Route, Routes } from 'react-router-dom'
import './App.css'
import PrototypePages from './prototype/PrototypePages'

function HomePage() {
  return (
    <div className="home-page">
      <header className="site-header">
        <Link className="brand" to="/">
          Календарь звонков
        </Link>
        <Link className="owner-link" to="/owner">
          Страница владельца
        </Link>
      </header>
      <main className="home-main">
        <section className="guest-panel" aria-labelledby="guest-title">
          <h1 id="guest-title">Забронируйте встречу без регистрации</h1>
          <ul className="feature-list">
            <li>Выбор типа встречи</li>
            <li>Свободные слоты на ближайшие 14 дней</li>
            <li>Подтверждение записи по имени и email</li>
          </ul>
          <Link className="primary-link" to="/book">
            Забронировать встречу
          </Link>
        </section>
      </main>
    </div>
  )
}

function PlaceholderPage({ title }: { title: string }) {
  return (
    <main className="simple-page">
      <h1>{title}</h1>
      <p>Раздел в разработке.</p>
      <Link to="/">На главную</Link>
    </main>
  )
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/prototype/pages" element={<PrototypePages />} />
      <Route
        path="/owner"
        element={<PlaceholderPage title="Страница владельца" />}
      />
      <Route
        path="/book"
        element={<PlaceholderPage title="Бронирование встречи" />}
      />
      <Route
        path="*"
        element={
          <main className="simple-page">
            <h1>Страница не найдена</h1>
            <Link to="/">На главную</Link>
          </main>
        }
      />
    </Routes>
  )
}

export default App
