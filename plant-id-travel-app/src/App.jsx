import { Routes, Route, Navigate } from 'react-router-dom'
import { useApp } from './lib/store'
import NavBar from './components/NavBar'
import HomeSetup from './pages/HomeSetup'
import Discover from './pages/Discover'
import PlantDetail from './pages/PlantDetail'
import TravelChat from './pages/TravelChat'
import Wishlist from './pages/Wishlist'

export default function App() {
  const { state } = useApp()
  const hasHome = !!state.homeClimate

  return (
    <div className="flex flex-col min-h-[100dvh]">
      <div className="flex-1 pb-20">
        <Routes>
          <Route path="/" element={hasHome ? <Discover /> : <HomeSetup />} />
          <Route path="/setup" element={<HomeSetup />} />
          <Route path="/discover" element={<Discover />} />
          <Route path="/plant/:plantId" element={<PlantDetail />} />
          <Route path="/travel" element={<TravelChat />} />
          <Route path="/wishlist" element={<Wishlist />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
      {hasHome && <NavBar />}
    </div>
  )
}
