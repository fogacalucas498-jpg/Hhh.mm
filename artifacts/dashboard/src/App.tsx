import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { ThemeProvider } from "@/hooks/useTheme";
import { NotificationsProvider } from "@/hooks/useNotifications";
import Layout from "@/components/Layout";
import LoginPage from "@/pages/LoginPage";
import LandingPage from "@/pages/LandingPage";
import DashboardPage from "@/pages/DashboardPage";
import AgentsPage from "@/pages/AgentsPage";
import DevicesPage from "@/pages/DevicesPage";
import MessagesPage from "@/pages/MessagesPage";
import ContactsPage from "@/pages/ContactsPage";
import FlowsPage from "@/pages/FlowsPage";
import SettingsPage from "@/pages/SettingsPage";
import ProfilePage from "@/pages/ProfilePage";

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
});

function AppRoutes() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <img src="/logo.jpg" alt="bot 777 🎰" className="w-12 h-12 rounded-2xl object-cover" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
          <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <Switch>
        <Route path="/login" component={LoginPage} />
        <Route path="/" component={LandingPage} />
        <Route><LandingPage /></Route>
      </Switch>
    );
  }

  return (
    <NotificationsProvider>
      <Layout>
        <Switch>
          <Route path="/" component={DashboardPage} />
          <Route path="/agents" component={AgentsPage} />
          <Route path="/devices" component={DevicesPage} />
          <Route path="/messages" component={MessagesPage} />
          <Route path="/contacts" component={ContactsPage} />
          <Route path="/flows" component={FlowsPage} />
          <Route path="/settings" component={SettingsPage} />
          <Route path="/profile" component={ProfilePage} />
          <Route path="/login"><Redirect to="/" /></Route>
          <Route><Redirect to="/" /></Route>
        </Switch>
      </Layout>
    </NotificationsProvider>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <AppRoutes />
          </WouterRouter>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
