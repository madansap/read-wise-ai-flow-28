
import React, { createContext, useContext, useEffect, useState } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { toast } from "@/components/ui/use-toast";

interface AuthContextType {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signUp: (email: string, password: string) => Promise<{
    error: any | null;
    data: any | null;
  }>;
  signIn: (email: string, password: string) => Promise<{
    error: any | null;
    data: any | null;
  }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    // Set up the auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        
        if (session?.user && _event === 'SIGNED_IN') {
          // User just signed in, show welcome toast
          toast({
            title: "Welcome back",
            description: `You're signed in as ${session.user.email}`,
          });
        }
      }
    );

    // Check for an existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const signUp = async (email: string, password: string) => {
    try {
      const result = await supabase.auth.signUp({ email, password });
      if (result.error) {
        toast({
          title: "Sign up failed",
          description: result.error.message,
          variant: "destructive",
        });
      } else if (result.data?.user) {
        toast({
          title: "Sign up successful",
          description: "Please check your email to verify your account.",
        });
      }
      return result;
    } catch (error: any) {
      toast({
        title: "Sign up failed",
        description: error.message,
        variant: "destructive",
      });
      return { error, data: null };
    }
  };

  const signIn = async (email: string, password: string) => {
    try {
      const result = await supabase.auth.signInWithPassword({ email, password });
      if (result.error) {
        toast({
          title: "Sign in failed",
          description: result.error.message,
          variant: "destructive",
        });
      }
      return result;
    } catch (error: any) {
      toast({
        title: "Sign in failed",
        description: error.message,
        variant: "destructive",
      });
      return { error, data: null };
    }
  };

  const signOut = async () => {
    try {
      // Clear any local storage items related to the app
      localStorage.removeItem('currentBookId');
      
      // Sign out from Supabase
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      
      // Reset local auth state
      setUser(null);
      setSession(null);
      
      toast({
        title: "Signed out",
        description: "You have been signed out successfully.",
      });
      
      // Navigate to login page
      navigate("/login");
    } catch (error: any) {
      console.error("Error signing out:", error);
      toast({
        title: "Error signing out",
        description: error.message,
        variant: "destructive",
      });
      // Still attempt to navigate to login even if there's an error
      navigate("/login");
    }
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        user,
        loading,
        signUp,
        signIn,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
