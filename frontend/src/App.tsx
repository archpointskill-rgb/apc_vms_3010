import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth";
import Layout from "./components/Layout";
import { Spinner } from "./components/ui";
import Admin from "./pages/Admin";
import Appointments from "./pages/Appointments";
import Board from "./pages/Board";
import CheckIn from "./pages/CheckIn";
import Contacts from "./pages/Contacts";
import PrGifts from "./pages/PrGifts";
import PrTasks from "./pages/PrTasks";
import RelationshipDetail from "./pages/RelationshipDetail";
import Relationships from "./pages/Relationships";
import Reports from "./pages/Reports";
import SignIn from "./pages/SignIn";
import type { Action } from "./types";

export default function App() {
  const { user, loading, can } = useAuth();

  if (loading) return <Spinner label="Opening ArchPoint Visitors…" />;
  if (!user) {
    return (
      <Routes>
        <Route path="*" element={<SignIn />} />
      </Routes>
    );
  }

  /** A screen the signed-in role cannot use simply is not there. */
  const guard = (action: Action, element: JSX.Element) => (can(action) ? element : <Navigate to="/board" replace />);
  const home = can("visit.checkIn") ? "/check-in" : "/board";

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Navigate to={home} replace />} />
        <Route path="/check-in" element={guard("visit.checkIn", <CheckIn />)} />
        <Route path="/board" element={<Board />} />
        <Route path="/appointments" element={guard("appointment.read", <Appointments />)} />
        <Route path="/contacts" element={guard("contact.read", <Contacts />)} />
        <Route path="/relationships" element={guard("pr.read", <Relationships />)} />
        <Route path="/relationships/tasks" element={guard("pr.read", <PrTasks />)} />
        <Route path="/relationships/gifts" element={guard("pr.read", <PrGifts />)} />
        <Route path="/relationships/:contactId" element={guard("pr.read", <RelationshipDetail />)} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/admin" element={guard("staff.manage", <Admin />)} />
        <Route path="*" element={<Navigate to={home} replace />} />
      </Routes>
    </Layout>
  );
}
