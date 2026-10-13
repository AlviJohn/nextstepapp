import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './lib/auth'
import { Spinner, ToastProvider } from './components/ui'
import AppShell from './components/AppShell'

// Each page loads on first visit, so the landing page doesn't ship the whole app.
const Landing = lazy(() => import('./pages/Landing'))
const Auth = lazy(() => import('./pages/Auth'))
const Focus = lazy(() => import('./pages/Focus'))
const Plan = lazy(() => import('./pages/Plan'))
const Review = lazy(() => import('./pages/Review'))
const Insights = lazy(() => import('./pages/Insights'))
const Upgrade = lazy(() => import('./pages/Upgrade'))

const Loading = () => (
  <div className="grid h-[50vh] place-items-center">
    <Spinner />
  </div>
)

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <Suspense fallback={<Loading />}>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<Auth mode="login" />} />
            <Route path="/signup" element={<Auth mode="signup" />} />
            <Route path="/app" element={<AppShell />}>
              <Route index element={<Focus />} />
              <Route path="plan" element={<Plan />} />
              <Route path="review" element={<Review />} />
              <Route path="insights" element={<Insights />} />
              <Route path="upgrade" element={<Upgrade />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          </Suspense>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
