import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { ReadingProvider } from "@/contexts/ReadingContext";
import { SelectionProvider } from "@/contexts/SelectionContext";
import RequireAuth from "@/components/RequireAuth";
import Index from "./pages/Index";
import Login from "./pages/Login";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <ThemeProvider>
            <ReadingProvider>
              <SelectionProvider>
                <Routes>
                  <Route path="/login" element={<Login />} />
                  <Route path="/" element={
                    <RequireAuth>
                      <Index />
                    </RequireAuth>
                  } />
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </SelectionProvider>
            </ReadingProvider>
          </ThemeProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
