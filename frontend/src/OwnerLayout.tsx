import { Link, NavLink, Outlet } from 'react-router-dom'

function OwnerLayout() {
  return (
    <div className="owner-page">
      <header className="site-header">
        <Link className="brand" to="/">
          Календарь звонков
        </Link>
        <nav className="owner-nav" aria-label="Разделы владельца">
          <NavLink to="/owner" end>
            Встречи
          </NavLink>
          <NavLink to="/owner/meeting-types">Типы встреч</NavLink>
          <NavLink to="/owner/availability">Доступность</NavLink>
        </nav>
      </header>
      <Outlet />
    </div>
  )
}

export default OwnerLayout
