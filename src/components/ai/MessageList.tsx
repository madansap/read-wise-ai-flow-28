
import React from 'react';
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Message } from '@/types/message';

interface MessageListProps {
  messages: Message[];
  filter?: (message: Message) => boolean;
  isBookProcessed: boolean | null;
  activeTab?: string;
}

export const MessageList: React.FC<MessageListProps> = ({ 
  messages, 
  filter, 
  isBookProcessed,
  activeTab
}) => {
  const messagesToDisplay = filter ? messages.filter(filter) : messages;

  return (
    <ScrollArea className="flex-grow">
      <div className="space-y-4">
        {messagesToDisplay.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className="flex flex-col max-w-[75%]">
              <div className={`rounded-lg p-3 text-sm ${msg.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground'}`}>
                {msg.content}
              </div>
              <div className="text-xs text-muted-foreground mt-1 flex items-center">
                {msg.role === 'assistant' && msg.context_used !== undefined && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Badge 
                          variant={msg.context_used ? "default" : "outline"} 
                          className={`mr-2 text-[10px] h-5 ${!msg.context_used && isBookProcessed === false ? "bg-amber-100 text-amber-800 hover:bg-amber-200" : ""}`}
                        >
                          {msg.context_used ? 'Using book context' : 'No book context found'}
                        </Badge>
                      </TooltipTrigger>
                      <TooltipContent>
                        {msg.context_used 
                          ? 'Response generated using context from the book' 
                          : isBookProcessed === false 
                            ? 'Book processing incomplete. Try "Process Book Content" from library menu'
                            : 'No relevant context found in the book'
                        }
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
                {new Date(msg.timestamp).toLocaleTimeString()}
              </div>
            </div>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
};
