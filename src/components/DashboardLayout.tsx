
import React, { useState, useEffect } from "react";
import { 
  ResizablePanel, 
  ResizablePanelGroup, 
  ResizableHandle 
} from "@/components/ui/resizable";
import { ChevronLeft, ChevronRight, Menu, BookOpen, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";

interface DashboardLayoutProps {
  leftPanel: React.ReactNode;
  centerPanel: React.ReactNode;
  rightPanel: React.ReactNode;
}

const DashboardLayout: React.FC<DashboardLayoutProps> = ({
  leftPanel,
  centerPanel,
  rightPanel,
}) => {
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);

  const toggleLeftPanel = () => {
    setLeftCollapsed(!leftCollapsed);
  };

  const toggleRightPanel = () => {
    setRightCollapsed(!rightCollapsed);
  };

  // Add keyboard shortcuts
  useEffect(() => {
    const handleKeydown = (event: KeyboardEvent) => {
      if (event.key === '[') {
        toggleLeftPanel();
      } else if (event.key === ']') {
        toggleRightPanel();
      }
    };

    window.addEventListener('keydown', handleKeydown);
    
    return () => {
      window.removeEventListener('keydown', handleKeydown);
    };
  }, [leftCollapsed, rightCollapsed]);

  return (
    <div className="h-screen w-full flex flex-col overflow-hidden">
      <header className="h-14 border-b flex items-center px-4 justify-between bg-background">
        <div className="flex items-center space-x-4">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={toggleLeftPanel} 
            className="hover:bg-muted"
            aria-label={leftCollapsed ? "Expand left panel" : "Collapse left panel"}
          >
            <Menu className="h-5 w-5" />
          </Button>
          <div className="flex items-center">
            <BookOpen className="h-5 w-5 text-primary mr-2" />
            <h1 className="text-lg font-semibold">ReadAssist</h1>
          </div>
        </div>
        <div className="flex items-center space-x-4">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={toggleRightPanel}
            className="hover:bg-muted"
            aria-label={rightCollapsed ? "Expand right panel" : "Collapse right panel"}
          >
            <MessageSquare className="h-5 w-5" />
          </Button>
        </div>
      </header>

      <ResizablePanelGroup
        direction="horizontal"
        className="flex-1 bg-background"
      >
        <ResizablePanel
          defaultSize={20}
          minSize={5}
          maxSize={40}
          collapsible={true}
          onCollapse={() => setLeftCollapsed(true)}
          onExpand={() => setLeftCollapsed(false)}
          className="relative"
        >
          <div className="h-full overflow-y-auto">
            {leftPanel}
          </div>
          {leftCollapsed && (
            <Button
              variant="outline"
              size="icon"
              onClick={toggleLeftPanel}
              className="absolute top-4 -right-4 h-8 w-8 rounded-full border border-border z-10 bg-background"
              aria-label="Expand left panel"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          )}
          {!leftCollapsed && (
            <Button
              variant="outline"
              size="icon"
              onClick={toggleLeftPanel}
              className="absolute top-4 -right-4 h-8 w-8 rounded-full border border-border z-10 bg-background"
              aria-label="Collapse left panel"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
          )}
        </ResizablePanel>

        <ResizableHandle withHandle className="panel-resize-handle w-1" />

        <ResizablePanel
          defaultSize={60}
          minSize={20}
          className="h-full overflow-y-auto"
        >
          {centerPanel}
        </ResizablePanel>

        <ResizableHandle withHandle className="panel-resize-handle w-1" />

        <ResizablePanel
          defaultSize={20}
          minSize={5}
          maxSize={40}
          collapsible={true}
          onCollapse={() => setRightCollapsed(true)}
          onExpand={() => setRightCollapsed(false)}
          className="relative"
        >
          <div className="h-full overflow-y-auto">
            {rightPanel}
          </div>
          {rightCollapsed && (
            <Button
              variant="outline"
              size="icon"
              onClick={toggleRightPanel}
              className="absolute top-4 -left-4 h-8 w-8 rounded-full border border-border z-10 bg-background"
              aria-label="Expand right panel"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
          )}
          {!rightCollapsed && (
            <Button
              variant="outline"
              size="icon"
              onClick={toggleRightPanel}
              className="absolute top-4 -left-4 h-8 w-8 rounded-full border border-border z-10 bg-background"
              aria-label="Collapse right panel"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          )}
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
};

export default DashboardLayout;
