import { Navigate, Route, Routes } from 'react-router-dom';
import { Shell } from './components/Shell.tsx';
import { SignIn } from './pages/SignIn.tsx';
import { Summary } from './pages/Summary.tsx';
import { Transactions } from './pages/Transactions.tsx';
import { TransactionDetail } from './pages/TransactionDetail.tsx';
import { Categories } from './pages/Categories.tsx';
import { Import } from './pages/Import.tsx';
import { Accounts } from './pages/Accounts.tsx';
import { Settings } from './pages/Settings.tsx';

export function App() {
  return (
    <Routes>
      <Route path="/signin" element={<SignIn />} />
      <Route element={<Shell />}>
        <Route index element={<Summary />} />
        <Route path="/transactions" element={<Transactions />} />
        <Route path="/transactions/:id" element={<TransactionDetail />} />
        <Route path="/categories" element={<Categories />} />
        <Route path="/import" element={<Import />} />
        <Route path="/accounts" element={<Accounts />} />
        <Route path="/settings" element={<Settings />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
