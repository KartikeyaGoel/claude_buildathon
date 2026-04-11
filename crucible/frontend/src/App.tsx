import { Route, Routes } from "react-router-dom";
import { HomePage } from "./pages/HomePage";
import { SessionPage } from "./pages/SessionPage";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/session/:id" element={<SessionPage />} />
    </Routes>
  );
}
