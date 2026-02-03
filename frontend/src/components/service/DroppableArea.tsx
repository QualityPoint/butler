import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import type { PackageItem } from "@/data/packages";
import { DraggableItem } from "./DraggableItem";
import { Button } from "@/components/retroui/Button";
import { cn } from "@/lib/utils";

interface DroppableAreaProps {
  items: PackageItem[];
  onRemove: (itemId: string) => void;
  onIncrement?: (itemId: string) => void;
  onDecrement?: (itemId: string) => void;
  onClearAll?: () => void;
  disabled?: boolean;
}

export function DroppableArea({ items, onRemove, onIncrement, onDecrement, onClearAll, disabled = false }: DroppableAreaProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: "selection-area",
    disabled,
  });

  return (
    <div className="bg-card border-4 border-border p-6 shadow-lg">
      <div className="flex justify-between items-center mb-4 border-b-2 border-border pb-2">
        <h2 className="text-3xl font-head">
          Your Package
        </h2>
        {onClearAll && items.length > 0 && (
          <Button variant="outline" onClick={onClearAll} size="sm">
            Clear All
          </Button>
        )}
      </div>

      <div
        ref={setNodeRef}
        className={cn(
          "h-125 rounded p-4 transition-colors overflow-y-auto",
          isOver
            ? "bg-primary/20 border-4 border-dashed border-primary"
            : "bg-muted/30 border-2 border-dashed border-muted",
          items.length === 0 && "flex items-center justify-center",
        )}
      >
        {items.length === 0 ? (
          <div className="text-center text-muted-foreground">
            <p className="text-xl font-head mb-2">Drop items here</p>
            <p className="font-sans">
              Drag items from the left to build your package
            </p>
          </div>
        ) : (
          <SortableContext
            items={items.map((item) => item.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-3">
              {items.map((item) => (
                <DraggableItem
                  key={item.id}
                  item={item}
                  onRemove={() => onRemove(item.id)}
                  onIncrement={onIncrement ? () => onIncrement(item.id) : undefined}
                  onDecrement={onDecrement ? () => onDecrement(item.id) : undefined}
                  disabled={disabled}
                />
              ))}
            </div>
          </SortableContext>
        )}
      </div>
    </div>
  );
}
