import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import type { PackageItem } from "@/data/packages";
import { DraggableItem } from "./DraggableItem";
import { cn } from "@/lib/utils";

interface DroppableAreaProps {
  items: PackageItem[];
  onRemove: (itemId: string) => void;
}

export function DroppableArea({ items, onRemove }: DroppableAreaProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: "selection-area",
  });

  return (
    <div className="bg-card border-4 border-border p-6 shadow-lg">
      <h2 className="text-3xl font-head mb-4 border-b-2 border-border pb-2">
        Your Package
      </h2>

      <div
        ref={setNodeRef}
        className={cn(
          "min-h-100 rounded p-4 transition-colors",
          isOver
            ? "bg-primary/20 border-2 border-dashed border-primary"
            : "bg-muted/30",
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
                />
              ))}
            </div>
          </SortableContext>
        )}
      </div>
    </div>
  );
}
