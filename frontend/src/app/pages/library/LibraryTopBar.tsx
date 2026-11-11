import { Link } from 'react-router-dom'
import { BrandMark } from '../../ui'
import UserDropdown from '../../../components/UserDropdown'

/** Clean app-native top bar for the Library — replaces the legacy TopBar. */
export function LibraryTopBar({ user }: { user: any }) {
  return (
    <header className="wv2-lib-topbar">
      <Link to="/library" className="wv2-lib-brand">
        <BrandMark size="md" />
      </Link>
      <div className="wv2-lib-topbar-spacer" />
      {user && <UserDropdown user={user} />}
    </header>
  )
}
