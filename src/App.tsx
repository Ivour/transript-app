import { BrowserRouter, Route, Routes } from "react-router";
import { AuthProvider } from "./hooks/AuthProvider";
import LoginPage from "./routes/LoginPage";
import ProtectedRoute from "./routes/ProtectedRoute";
import TranscribePage from "./routes/TranscribePage";
import UsagePage from "./routes/UsagePage";
import StatusBarBackdrop from "./components/StatusBarBackdrop";

function App() {
  return (
    <BrowserRouter>
      <StatusBarBackdrop />
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <TranscribePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/usage"
            element={
              <ProtectedRoute>
                <UsagePage />
              </ProtectedRoute>
            }
          />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
