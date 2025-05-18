
import { useEffect } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";

interface RequireAuthProps {
  children: React.ReactNode;
}

const RequireAuth: React.FC<RequireAuthProps> = ({ children }) => {
  const { user, loading, session } = useAuth();
  const location = useLocation();

  // Effect to check session expiration
  useEffect(() => {
    if (session && session.expires_at) {
      const expiresAt = session.expires_at * 1000; // convert to milliseconds
      const now = Date.now();
      
      // Check if session is about to expire (less than 5 minutes)
      if (expiresAt - now < 5 * 60 * 1000) {
        toast({
          title: "Session Expiring",
          description: "Your session will expire soon. Please save your work.",
          variant: "destructive",
        });
      }
    }
  }, [session]);

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!user) {
    // Store the location they were trying to access for potential redirect after login
    // Clear any expired auth data
    localStorage.removeItem('currentBookId');
    
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
};

export default RequireAuth;
