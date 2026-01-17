import { useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type { DragEndEvent, DragStartEvent } from "@dnd-kit/core";
import { arrayMove, SortableContext } from "@dnd-kit/sortable";
import { useUser } from "@/contexts/UserContext";
import { Button } from "@/components/retroui/Button";
import type { PackageItem, PackageCategory } from "@/data/packages";
import {
  getAllPackageItems,
  packageCategories,
  packageData,
} from "@/data/packages";
import { DraggableItem } from "@/components/service/DraggableItem";
import { DroppableArea } from "@/components/service/DroppableArea";
import { CategoryList } from "@/components/service/CategoryList";

function Service() {
  const { currentUser } = useUser();
  const [selectedCategory, setSelectedCategory] = useState<PackageCategory>(
    packageCategories[0],
  );
  const [selectedItems, setSelectedItems] = useState<PackageItem[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over) return;

    // Check if dropped on the selection area
    if (over.id === "selection-area") {
      const allItems = getAllPackageItems();
      const draggedItem = allItems.find((item) => item.id === active.id);

      if (
        draggedItem &&
        !selectedItems.find((item) => item.id === draggedItem.id)
      ) {
        setSelectedItems([...selectedItems, draggedItem]);
      }
      return;
    }

    // Reordering within selected items
    if (active.id !== over.id) {
      const oldIndex = selectedItems.findIndex((item) => item.id === active.id);
      const newIndex = selectedItems.findIndex((item) => item.id === over.id);

      if (oldIndex !== -1 && newIndex !== -1) {
        setSelectedItems(arrayMove(selectedItems, oldIndex, newIndex));
      }
    }
  };

  const handleRemoveItem = (itemId: string) => {
    setSelectedItems(selectedItems.filter((item) => item.id !== itemId));
  };

  const handleClearAll = () => {
    setSelectedItems([]);
  };

  const handleSaveSelection = () => {
    console.log("Saving selection:", selectedItems);
    // TODO: Send to Frappe backend
    setShowSuccess(true);
    setTimeout(() => {
      setShowSuccess(false);
    }, 4000);
  };

  const activeItem = activeId
    ? getAllPackageItems().find((item) => item.id === activeId) ||
      selectedItems.find((item) => item.id === activeId)
    : null;

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="min-h-screen bg-background p-8">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="bg-primary border-4 border-border p-6 shadow-xl mb-8">
            <div className="flex items-center gap-4">
              <div className="flex justify-center">
                <img
                  src="/assets/butler/images/logo.svg"
                  alt="Butler Logo"
                  className="h-20 w-20"
                />
              </div>
              <div className="w-full">
                <h1 className="text-5xl font-head text-center">
                  Service Packages
                </h1>
                <p className="text-center mt-2 font-sans text-lg">
                  Drag and drop items to build your custom package
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Left: Category Selection */}
            <div className="space-y-6">
              <div className="bg-card border-4 border-border p-6 shadow-lg">
                <h2 className="text-3xl font-head mb-4 border-b-2 border-border pb-2">
                  Categories
                </h2>
                <div className="flex flex-wrap gap-3">
                  {packageCategories.map((category) => (
                    <Button
                      key={category}
                      variant={
                        selectedCategory === category ? "secondary" : "outline"
                      }
                      onClick={() => setSelectedCategory(category)}
                    >
                      {category}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Available Items */}
              <div className="bg-card border-4 border-border p-6 shadow-lg">
                <h3 className="text-2xl font-head mb-4 border-b-2 border-border pb-2">
                  {selectedCategory} Items
                </h3>
                <CategoryList
                  category={selectedCategory}
                  items={packageData[selectedCategory]}
                  selectedItems={selectedItems}
                />
              </div>
            </div>

            {/* Right: Selected Items */}
            <div className="space-y-6">
              <DroppableArea
                items={selectedItems}
                onRemove={handleRemoveItem}
              />

              {/* Actions */}
              <div className="bg-accent border-4 border-border p-6 shadow-md">
                <div className="flex justify-between items-center mb-4">
                  <span className="font-head text-xl">
                    Selected: {selectedItems.length} items
                  </span>
                  <Button variant="outline" onClick={handleClearAll}>
                    Clear All
                  </Button>
                </div>
                <Button
                  className="w-full text-lg"
                  onClick={handleSaveSelection}
                  disabled={selectedItems.length === 0}
                >
                  Save Package
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Success Message */}
      {showSuccess && (
        <div className="fixed inset-0 flex items-center justify-center z-50 bg-black/20 animate-in fade-in duration-300">
          <div className="bg-[#f5f1e8] border-8 border-[#8b7355] p-12 shadow-2xl max-w-md mx-4 animate-in zoom-in duration-500">
            <div className="text-center space-y-6">
              <div className="text-6xl animate-bounce">🎉</div>
              <h2 className="text-4xl font-head text-[#5a4a3a] mb-4">
                Congratulations!
              </h2>
              <p className="text-xl font-sans text-[#6b5b4b]">
                Your package with {selectedItems.length} items has been saved
                successfully!
              </p>
              <div className="pt-4 border-t-4 border-[#8b7355]">
                <p className="text-sm font-sans text-[#8b7355] italic">
                  Package created for {currentUser}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
      <DragOverlay>
        {activeItem ? <DraggableItem item={activeItem} isDragging /> : null}
      </DragOverlay>
    </DndContext>
  );
}

export default Service;
