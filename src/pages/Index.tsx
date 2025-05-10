
import React from "react";
import DashboardLayout from "@/components/DashboardLayout";
import NavigationPanel from "@/components/NavigationPanel";
import ReadingPanel from "@/components/ReadingPanel";
import AIAssistantPanel from "@/components/AIAssistantPanel";

export default function Index() {
  return (
    <DashboardLayout 
      leftPanel={<NavigationPanel />}
      centerPanel={<ReadingPanel />}
      rightPanel={<AIAssistantPanel />}
    />
  );
}
