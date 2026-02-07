import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type { DragEndEvent, DragStartEvent } from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import { useFrappeGetDocList, useFrappeCreateDoc, useFrappeGetDoc, useFrappeUpdateDoc } from "frappe-react-sdk";
import { Button } from "@/components/retroui/Button";
import { showWarning } from "@/lib/errorHandler";
import { ConfirmationDialog } from "@/components/ui/ConfirmationDialog";
import type { PackageItem } from "@/data/packages";
import { DraggableItem } from "@/components/service/DraggableItem";
import { DroppableArea } from "@/components/service/DroppableArea";
import { Congratulations } from "@/components/ui/Congratulations";
import { FacilityDetailsModal } from "@/components/FacilityDetailsModal";
import { Bundle, BundleDetails } from "@/components/Bundle";
import { Home, ArrowLeft } from "lucide-react";
import { useDraggable } from "@dnd-kit/core";
import { cn } from "@/lib/utils";

type OrderType = "" | "Bundle" | "Quotation" | "Amenities";

interface BundleCategory {
  amenity_category: string;
  number_of_amenities: number;
}

interface BundleDetails {
  bundle_price: number;
  amenity_categories: BundleCategory[];
}

interface AmenityCategory {
  name: string;
  category_name: string;
  description?: string;
  image?: string;
}

interface Amenity {
  name: string;
  amenity_name: string;
  amenity_category: string;
  amenity_price: number;
  lines: number;
  image?: string;
  disabled: number;
}

// Amenity Card Component for drag and drop
function AmenityCard({
  amenity,
  isSelected,
  isCategoryFull = false,
}: {
  amenity: Amenity;
  isSelected: boolean;
  isCategoryFull?: boolean;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: amenity.name,
    disabled: isSelected || isCategoryFull,
  });

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={cn(
        "bg-card border-3 border-border p-4 cursor-grab active:cursor-grabbing",
        "shadow-md hover:shadow-lg transition-all hover:-translate-y-0.5",
        "font-sans text-sm",
        isDragging && "opacity-50",
        isSelected && "opacity-40 cursor-not-allowed bg-muted",
        isCategoryFull && !isSelected && "opacity-30 cursor-not-allowed bg-gray-50",
      )}
    >
      <div className="flex items-center justify-between">
        <span>{amenity.amenity_name}</span>
        {isSelected && (
          <span className="text-xs bg-green-500 text-white px-2 py-0.5 border border-border">
            ✓
          </span>
        )}
        {isCategoryFull && !isSelected && (
          <span className="text-xs bg-gray-400 text-white px-2 py-0.5 border border-border">
            Full
          </span>
        )}
      </div>
    </div>
  );
}

function Service() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  
  const facilityId = searchParams.get("facility_id");
  const orderId = searchParams.get("order_id");
  
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [selectedItems, setSelectedItems] = useState<PackageItem[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isConfirmDialogOpen, setIsConfirmDialogOpen] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isFacilityModalOpen, setIsFacilityModalOpen] = useState(false);
  
  const { createDoc, loading: isCreating } = useFrappeCreateDoc();
  const { updateDoc, loading: isUpdating } = useFrappeUpdateDoc();
  
  // Fetch existing order if orderId is provided
  const { data: existingOrder, isLoading: isLoadingOrder } = useFrappeGetDoc<{
    name: string;
    facility: string;
    order_type: string;
    bundle_type?: string;
    bundle_price?: number;
    docstatus: number;
    amenities: Array<{
      amenity_name: string;
      count: number;
    }>;
  }>("Service Order", orderId || undefined, orderId ? undefined : {
    enabled: false
  });
  
  const isEditMode = !!orderId;
  const isEditable = !isEditMode || existingOrder?.docstatus === 0;
  
  // Service Order fields
  const [orderType, setOrderType] = useState<OrderType>("Amenities");
  const [bundleType, setBundleType] = useState<string>("");
  const [bundleDetails, setBundleDetails] = useState<BundleDetails | null>(null);
  
  // Fetch Amenity Categories
  const { data: amenityCategories } = useFrappeGetDocList<AmenityCategory>(
    "Amenity Category",
    {
      fields: ["name", "category_name", "description", "image"],
      limit: 100,
    }
  );
  
  // Fetch Amenities
  const { data: amenities } = useFrappeGetDocList<Amenity>(
    "Amenity",
    {
      fields: ["name", "amenity_name", "amenity_category", "amenity_price", "lines", "image", "disabled"],
      filters: [["disabled", "=", 0]],
      limit: 1000,
    }
  );
  
  // Load existing order data
  useEffect(() => {
    if (existingOrder && amenities && existingOrder.amenities?.length > 0) {
      setOrderType(existingOrder.order_type as OrderType);
      if (existingOrder.bundle_type) {
        setBundleType(existingOrder.bundle_type);
      }
      
      // Map amenities to selectedItems
      const items: PackageItem[] = existingOrder.amenities.map(orderAmenity => {
        const amenity = amenities.find(a => a.name === orderAmenity.amenity_name);
        return {
          id: orderAmenity.amenity_name,
          name: amenity?.amenity_name || orderAmenity.amenity_name,
          category: amenity?.amenity_category || "",
          count: orderAmenity.count
        };
      });
      setSelectedItems(items);
    }
  }, [existingOrder, amenities]);
  
  // Set initial category when categories are loaded
  useEffect(() => {
    if (amenityCategories && amenityCategories.length > 0 && !selectedCategory) {
      setSelectedCategory(amenityCategories[0].name);
    }
  }, [amenityCategories]);
  
  // Reset bundle_type when order_type changes
  useEffect(() => {
    if (orderType !== "Bundle") {
      setBundleType("");
      setBundleDetails(null);
    }
    // Clear selected items when order type changes
    setSelectedItems([]);
  }, [orderType]);
  
  // Clear selected items when bundle type changes
  useEffect(() => {
    if (bundleType) {
      setSelectedItems([]);
    }
  }, [bundleType]);
  
  // Update selected category when bundle details change
  useEffect(() => {
    if (orderType === "Bundle" && bundleDetails && bundleDetails.amenity_categories.length > 0) {
      // Set to first category in bundle if current selection is not in bundle
      const currentCategoryInBundle = bundleDetails.amenity_categories.some(
        (bc) => bc.amenity_category === selectedCategory
      );
      if (!currentCategoryInBundle) {
        setSelectedCategory(bundleDetails.amenity_categories[0].amenity_category);
      }
    } else if (orderType !== "Bundle" && amenityCategories && amenityCategories.length > 0 && !selectedCategory) {
      // Reset to first category when not bundle mode
      setSelectedCategory(amenityCategories[0].name);
    }
  }, [bundleDetails, orderType, amenityCategories]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 2,
        delay: 0,
        tolerance: 5,
      },
    })
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
      const draggedAmenity = amenities?.find((amenity) => amenity.name === active.id);

      if (
        draggedAmenity &&
        !selectedItems.find((item) => item.id === draggedAmenity.name)
      ) {
        // Check bundle restrictions if order type is Bundle and bundle is selected
        if (orderType === "Bundle" && bundleDetails) {
          const bundleCategory = bundleDetails.amenity_categories.find(
            (bc) => bc.amenity_category === draggedAmenity.amenity_category
          );
          
          if (bundleCategory) {
            // Count current items in this category (sum of counts)
            const currentCount = selectedItems
              .filter((item) => item.category === draggedAmenity.amenity_category)
              .reduce((sum, item) => sum + item.count, 0);
            
            // Check if adding this item would exceed the limit
            if (currentCount >= bundleCategory.number_of_amenities) {
              showWarning(
                `Cannot add more amenities. Maximum ${bundleCategory.number_of_amenities} amenities allowed for ${draggedAmenity.amenity_category} category in this bundle.`
              );
              return;
            }
          }
        }
        
        const packageItem: PackageItem = {
          id: draggedAmenity.name,
          name: draggedAmenity.amenity_name,
          category: draggedAmenity.amenity_category,
          count: 1,
        };
        setSelectedItems([...selectedItems, packageItem]);
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

  const handleIncrementCount = (itemId: string) => {
    setSelectedItems(
      selectedItems.map((item) =>
        item.id === itemId ? { ...item, count: item.count + 1 } : item
      )
    );
  };

  const handleDecrementCount = (itemId: string) => {
    setSelectedItems(
      selectedItems.map((item) =>
        item.id === itemId && item.count > 1
          ? { ...item, count: item.count - 1 }
          : item
      )
    );
  };

  const handleMakeOrder = () => {
    if (selectedItems.length === 0) {
      showWarning("Please select at least one item to save");
      return;
    }
    
    if (!facilityId) {
      showWarning("No facility selected. Please select a facility first.");
      return;
    }
    
    if (!orderType) {
      showWarning("Please select an order type");
      return;
    }
    
    if (orderType === "Bundle" && !bundleType) {
      showWarning("Please select a bundle type");
      return;
    }
    
    // Validate bundle requirements if order type is Bundle
    if (orderType === "Bundle" && bundleDetails) {
      const missingCategories: string[] = [];
      const incompleteCategories: string[] = [];
      
      bundleDetails.amenity_categories.forEach((bundleCategory) => {
        const selectedCount = selectedItems
          .filter((item) => item.category === bundleCategory.amenity_category)
          .reduce((sum, item) => sum + item.count, 0);
        
        if (selectedCount === 0) {
          missingCategories.push(bundleCategory.amenity_category);
        } else if (selectedCount < bundleCategory.number_of_amenities) {
          incompleteCategories.push(
            `${bundleCategory.amenity_category} (${selectedCount}/${bundleCategory.number_of_amenities})`
          );
        }
      });
      
      if (missingCategories.length > 0) {
        showWarning(
          `Please add amenities for: ${missingCategories.join(", ")}`
        );
        return;
      }
      
      if (incompleteCategories.length > 0) {
        showWarning(
          `Please complete the required amenities for: ${incompleteCategories.join(", ")}`
        );
        return;
      }
    }

    setIsConfirmDialogOpen(true);
  };

  const handleConfirmOrder = async () => {
    try {
      if (isEditMode && orderId) {
        // Update existing order
        await updateDoc("Service Order", orderId, {
          order_type: orderType,
          bundle_type: orderType === "Bundle" ? bundleType : undefined,
          bundle_price: bundleDetails?.bundle_price || 0,
          amenities: selectedItems.map((item, idx) => ({
            amenity_name: item.id,
            count: item.count,
            idx: idx + 1
          }))
        });
      } else {
        // Create new order
        await createDoc("Service Order", {
          facility: facilityId,
          order_type: orderType,
          bundle_type: orderType === "Bundle" ? bundleType : undefined,
          bundle_price: bundleDetails?.bundle_price || 0,
          order_date: new Date().toISOString().split('T')[0],
          amenities: selectedItems.map((item, idx) => ({
            amenity_name: item.id,
            count: item.count,
            idx: idx + 1
          }))
        });
      }
      
      setIsConfirmDialogOpen(false);
      setIsModalOpen(true);
      if (!isEditMode) {
        setSelectedItems([]);
      }
    } catch (error) {
      console.error(isEditMode ? "Order update failed:" : "Order creation failed:", error);
      showWarning(isEditMode ? "Failed to update order. Please try again." : "Failed to create order. Please try again.");
    }
  };

  const activeItem = activeId
    ? (() => {
        const selected = selectedItems.find((item) => item.id === activeId);
        if (selected) return selected;
        
        const amenity = amenities?.find((a) => a.name === activeId);
        if (amenity) {
          return {
            id: amenity.name,
            name: amenity.amenity_name,
            category: amenity.amenity_category,
            count: 1,
          };
        }
        return null;
      })()
    : null;

  return (
    <DndContext
      key={`${orderType}-${bundleType}`}
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
              <div className="w-full max-w-2xl">
                <h1 className="text-3xl sm:text-4xl font-head text-center break-words">
                  Service Packages
                </h1>
                <p className="text-center mt-2 font-sans text-base sm:text-lg break-words">
                  Drag and drop items to build your custom package
                </p>
              </div>
            </div>
          </div>
          
          {/* Warning if no facility selected */}
          {!facilityId && !existingOrder?.facility && (
            <div className="bg-destructive border-4 border-border p-6 shadow-lg mb-8 text-center">
              <p className="font-head text-xl text-white">
                ⚠️ No facility selected. Please select a facility from the Facilities page first.
              </p>
            </div>
          )}
          
          {/* Facility ID Display */}
          {(facilityId || existingOrder?.facility) && (
            <div className="bg-card border-4 border-border p-6 shadow-lg mb-8">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <label className="block font-head mb-2 text-sm">
                    Facility
                  </label>
                  <div className="px-4 py-3 border-4 border-border font-sans bg-muted">
                    {facilityId || existingOrder?.facility}
                  </div>
                </div>
                <Button
                  variant="outline"
                  onClick={() => setIsFacilityModalOpen(true)}
                  className="ml-4"
                >
                  View Details
                </Button>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Left: Category Selection */}
            <div className="space-y-6">
              <div className="bg-card border-4 border-border p-6 shadow-lg">
                <h2 className="text-2xl font-head mb-4 border-b-2 border-border pb-2 break-words">
                  Categories
                </h2>
                <div className="flex flex-wrap gap-3">
                  {(orderType === "Bundle" && bundleDetails
                    ? amenityCategories?.filter((cat) =>
                        bundleDetails.amenity_categories.some(
                          (bc) => bc.amenity_category === cat.name
                        )
                      )
                    : orderType === "Bundle" && !bundleDetails
                    ? []
                    : amenityCategories
                  )?.map((category) => {
                    const bundleCategory = bundleDetails?.amenity_categories.find(
                      (bc) => bc.amenity_category === category.name
                    );
                    const selectedCount = selectedItems
                      .filter((item) => item.category === category.name)
                      .reduce((sum, item) => sum + item.count, 0);
                    const requiredCount = bundleCategory?.number_of_amenities || 0;
                    
                    return (
                      <Button
                        key={category.name}
                        variant={
                          selectedCategory === category.name ? "secondary" : "outline"
                        }
                        onClick={() => setSelectedCategory(category.name)}
                        className="relative"
                      >
                        {category.category_name}
                        {orderType === "Bundle" && bundleDetails && bundleCategory && (
                          <span className="ml-2 px-2 py-0.5 text-xs bg-primary text-primary-foreground rounded">
                            {selectedCount}/{requiredCount}
                          </span>
                        )}
                      </Button>
                    );
                  })}
                  {orderType === "Bundle" && !bundleDetails && (
                    <p className="text-muted-foreground font-sans text-sm">
                      Please select a bundle to see available categories
                    </p>
                  )}
                </div>
              </div>

              {/* Available Items */}
              <div className="bg-card border-4 border-border p-6 shadow-lg">
                <h3 className="text-xl font-head mb-4 border-b-2 border-border pb-2 break-words line-clamp-2">
                  {amenityCategories?.find((cat) => cat.name === selectedCategory)?.category_name || "Select a Category"} Items
                </h3>
                <div className="flex flex-col gap-3 h-125 overflow-y-auto pr-2">
                  {amenities
                    ?.filter((amenity) => amenity.amenity_category === selectedCategory)
                    .map((amenity) => {
                      const isSelected = selectedItems.some((item) => item.id === amenity.name);
                      
                      // Check if category is full (only for Bundle order type)
                      let isCategoryFull = false;
                      if (orderType === "Bundle" && bundleDetails) {
                        const bundleCategory = bundleDetails.amenity_categories.find(
                          (bc) => bc.amenity_category === selectedCategory
                        );
                        if (bundleCategory) {
                          const currentCount = selectedItems
                            .filter((item) => item.category === selectedCategory)
                            .reduce((sum, item) => sum + item.count, 0);
                          isCategoryFull = currentCount >= bundleCategory.number_of_amenities;
                        }
                      }
                      
                      return (
                        <AmenityCard
                          key={amenity.name}
                          amenity={amenity}
                          isSelected={isSelected}
                          isCategoryFull={isCategoryFull}
                        />
                      );
                    })}
                </div>
              </div>
            </div>

            {/* Right: Selected Items */}
            <div className="space-y-6">
              <Bundle
                orderType={orderType}
                bundleType={bundleType}
                bundleDetails={bundleDetails}
                selectedItems={selectedItems}
                onOrderTypeChange={setOrderType}
                onBundleTypeChange={setBundleType}
                onBundleDetailsChange={setBundleDetails}
                disabled={!isEditable}
              />
              
              <DroppableArea
                items={selectedItems}
                onRemove={handleRemoveItem}
                onIncrement={handleIncrementCount}
                onDecrement={handleDecrementCount}
                onClearAll={handleClearAll}
                disabled={!isEditable}
              />
            </div>
          </div>

          {/* Bundle Details - Full Width Below */}
          <BundleDetails
            bundleDetails={bundleDetails}
            orderType={orderType}
            selectedItems={selectedItems}
          />

          {/* Make Order Button */}
          {isEditable && (
            <div className="mt-8 flex justify-center">
              <Button
                size="lg"
                className="text-xl px-12 py-6"
                onClick={handleMakeOrder}
                disabled={selectedItems.length === 0 || isCreating || isUpdating}
              >
                {isEditMode ? "Update Order" : "Make Order"}
              </Button>
            </div>
          )}
          {isEditMode && !isEditable && (
            <div className="mt-8 bg-yellow-100 border-4 border-yellow-400 p-4 text-center">
              <p className="font-head text-lg">This order has been submitted and cannot be edited.</p>
            </div>
          )}

          {/* Navigation Buttons */}
          <div className="mt-6 flex justify-center gap-4">
            <Button
              variant="outline"
              onClick={() => navigate(-1)}
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
            <Button
              variant="outline"
              onClick={() => navigate("/")}
            >
              <Home className="w-4 h-4 mr-2" />
              Home
            </Button>
          </div>
        </div>
      </div>

      <DragOverlay>
        {activeItem ? <DraggableItem item={activeItem} isDragging /> : null}
      </DragOverlay>

      <Congratulations
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        itemCount={selectedItems.reduce((sum, item) => sum + item.count, 0)}
      />
      
      <FacilityDetailsModal
        facilityId={facilityId || existingOrder?.facility || ""}
        isOpen={isFacilityModalOpen}
        onClose={() => setIsFacilityModalOpen(false)}
      />
      
      <ConfirmationDialog
        isOpen={isConfirmDialogOpen}
        onClose={() => setIsConfirmDialogOpen(false)}
        onConfirm={handleConfirmOrder}
        title={isEditMode ? "Update Service Order" : "Create Service Order"}
        message={isEditMode 
          ? `Are you sure you want to update this service order with ${selectedItems.reduce((sum, item) => sum + item.count, 0)} items?`
          : `Are you sure you want to create a service order for facility ${facilityId || existingOrder?.facility} with ${selectedItems.reduce((sum, item) => sum + item.count, 0)} items?`
        }
        confirmText={isEditMode ? "Update Order" : "Create Order"}
        cancelText="Cancel"
        isLoading={isCreating || isUpdating}
      />
    </DndContext>
  );
}

export default Service;
