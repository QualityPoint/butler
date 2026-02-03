/**
 * Error Handling Examples for Butler App
 * 
 * This file demonstrates various error handling patterns using the Butler error handling system.
 * Copy these patterns to your components as needed.
 */

import { useState } from "react";
import {
  useFrappeGetDoc,
  useFrappeGetDocList,
  useFrappePostCall,
  useFrappeCreateDoc,
  useFrappeUpdateDoc,
  useFrappeDeleteDoc,
} from "frappe-react-sdk";
import { ErrorBanner, ErrorMessage } from "@/components/ui/error-banner";
import {
  showFrappeError,
  showSuccess,
  showWarning,
  showInfo,
  handleAsyncOperation,
  handleUpdate,
  handleCreate,
  handleDelete,
} from "@/lib/errorHandler";
import { Button } from "@/components/retroui/Button";

// ============================================================================
// PATTERN 1: GET Request with ErrorBanner
// Use when: Loading data for a page/section
// ============================================================================

export function ServiceDetailPage({ serviceId }: { serviceId: string }) {
  const { data, error, isLoading } = useFrappeGetDoc(
    "Butler Service",
    serviceId
  );

  // Show error banner if data fails to load
  if (error) {
    return (
      <div className="p-4">
        <ErrorBanner 
          error={error} 
          title="Failed to load service" 
        />
      </div>
    );
  }

  if (isLoading) {
    return <div>Loading...</div>;
  }

  return (
    <div>
      <h1>{data?.name}</h1>
      {/* Your content */}
    </div>
  );
}

// ============================================================================
// PATTERN 2: GET List with ErrorBanner
// Use when: Loading lists of documents
// ============================================================================

export function ServiceList() {
  const { data, error, isLoading } = useFrappeGetDocList("Butler Service", {
    fields: ["name", "title", "category", "status"],
    orderBy: { field: "modified", order: "desc" },
    limit: 100,
  });

  return (
    <div className="space-y-4">
      <h2>Services</h2>
      
      {/* Inline error message */}
      {error && <ErrorMessage error={error} className="my-2" />}
      
      {isLoading && <div>Loading services...</div>}
      
      {data?.map((service) => (
        <div key={service.name}>{service.title}</div>
      ))}
    </div>
  );
}

// ============================================================================
// PATTERN 3: POST/Create with Toast
// Use when: Creating new documents
// ============================================================================

export function CreateServiceForm() {
  const { createDoc, loading } = useFrappeCreateDoc();
  const [formData, setFormData] = useState({ title: "", category: "" });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Method 1: Using handleCreate helper (recommended)
    const success = await handleCreate(
      () => createDoc("Butler Service", formData),
      "Service",
      { successMessage: "Service created successfully! 🎉" }
    );

    if (success) {
      setFormData({ title: "", category: "" }); // Reset form
    }
  };

  // Alternative Method 2: Manual try-catch (example only)
  // const handleSubmitManual = async (e: React.FormEvent) => {
  //   e.preventDefault();
  //   try {
  //     const doc = await createDoc("Butler Service", formData);
  //     showSuccess("Service created successfully!");
  //     console.log("Created doc:", doc);
  //     setFormData({ title: "", category: "" });
  //   } catch (error) {
  //     showFrappeError(error);
  //   }
  // };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <input
        type="text"
        value={formData.title}
        onChange={(e) => setFormData({ ...formData, title: e.target.value })}
        placeholder="Service Title"
        className="border p-2 rounded"
      />
      
      <Button type="submit" disabled={loading}>
        {loading ? "Creating..." : "Create Service"}
      </Button>
    </form>
  );
}

// ============================================================================
// PATTERN 4: Update with Toast
// Use when: Updating existing documents
// ============================================================================

export function EditServiceForm({ 
  serviceId, 
  initialData 
}: { 
  serviceId: string; 
  initialData: any 
}) {
  const { updateDoc, loading } = useFrappeUpdateDoc();
  const [formData, setFormData] = useState(initialData);

  const handleSave = async () => {
    // Method 1: Using handleUpdate helper
    await handleUpdate(
      () => updateDoc("Butler Service", serviceId, formData),
      "Service",
      { successMessage: "Changes saved!" }
    );
  };

  // Method 2: With custom success callback (example only)
  // const handleSaveWithCallback = async () => {
  //   const result = await handleAsyncOperation(
  //     () => updateDoc("Butler Service", serviceId, formData),
  //     {
  //       successMessage: "Service updated!",
  //       onSuccess: (doc) => {
  //         console.log("Updated doc:", doc);
  //       },
  //       onError: (error) => {
  //         console.error("Update failed:", error);
  //       },
  //     }
  //   );
  //   if (result.success) {
  //     // Do something after success
  //   }
  // };

  return (
    <div className="space-y-4">
      <input
        type="text"
        value={formData.title}
        onChange={(e) => setFormData({ ...formData, title: e.target.value })}
        className="border p-2 rounded"
      />

      <Button onClick={handleSave} disabled={loading}>
        {loading ? "Saving..." : "Save Changes"}
      </Button>
    </div>
  );
}

// ============================================================================
// PATTERN 5: Delete with Confirmation
// Use when: Deleting documents
// ============================================================================

export function DeleteServiceButton({ 
  serviceId, 
  onDeleted 
}: { 
  serviceId: string; 
  onDeleted?: () => void 
}) {
  const { deleteDoc, loading } = useFrappeDeleteDoc();

  const handleDeleteService = async () => {
    // Show confirmation
    if (!confirm("Are you sure you want to delete this service?")) {
      return;
    }

    await handleDelete(
      () => deleteDoc("Butler Service", serviceId),
      "Service",
      { successMessage: "Service deleted successfully" }
    );

    onDeleted?.();
  };

  return (
    <Button 
      variant="outline" 
      onClick={handleDeleteService} 
      disabled={loading}
    >
      {loading ? "Deleting..." : "Delete"}
    </Button>
  );
}

// ============================================================================
// PATTERN 6: API Call (POST) with Toast
// Use when: Calling custom backend methods
// ============================================================================

export function SortServicesButton({ services }: { services: any[] }) {
  const { call, loading, error } = useFrappePostCall("butler.api.sort_services");

  const handleSort = async () => {
    const result = await handleAsyncOperation(
      () => call({ services: services.map((s) => s.name) }),
      {
        successMessage: `${services.length} services sorted successfully!`,
        showSuccess: true,
      }
    );

    if (result.success) {
      console.log("Sort result:", result.data);
    }
  };

  // Show error banner if hook itself fails
  if (error) {
    return <ErrorMessage error={error} />;
  }

  return (
    <Button onClick={handleSort} disabled={loading}>
      {loading ? "Sorting..." : "Sort Services"}
    </Button>
  );
}

// ============================================================================
// PATTERN 7: Multiple Operations with Loading States
// Use when: Complex operations with multiple steps
// ============================================================================

export function ComplexOperationExample() {
  const [isProcessing, setIsProcessing] = useState(false);
  const { call: processService } = useFrappePostCall("butler.api.process_service");
  const { updateDoc } = useFrappeUpdateDoc();

  const handleComplexOperation = async (serviceId: string) => {
    setIsProcessing(true);

    try {
      // Step 1: Process service
      showInfo("Processing service...");
      await processService({ service_id: serviceId });

      // Step 2: Update service status
      showInfo("Updating status...");
      await updateDoc("Butler Service", serviceId, {
        status: "Processed",
        processed_at: new Date().toISOString(),
      });

      // Success
      showSuccess("Service processed successfully! ✨");
      
    } catch (error) {
      showFrappeError(error);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Button onClick={() => handleComplexOperation("SRV-001")} disabled={isProcessing}>
      {isProcessing ? "Processing..." : "Process Service"}
    </Button>
  );
}

// ============================================================================
// PATTERN 8: Batch Operations
// Use when: Operating on multiple items
// ============================================================================

export function BatchOperationExample({ serviceIds }: { serviceIds: string[] }) {
  const { updateDoc } = useFrappeUpdateDoc();
  const [processing, setProcessing] = useState(false);

  const handleBatchUpdate = async () => {
    setProcessing(true);
    
    let successCount = 0;
    let failCount = 0;

    for (const id of serviceIds) {
      const result = await handleAsyncOperation(
        () => updateDoc("Butler Service", id, { status: "Active" }),
        {
          showSuccess: false, // Don't show toast for each item
          showError: true,
        }
      );

      if (result.success) {
        successCount++;
      } else {
        failCount++;
      }
    }

    setProcessing(false);

    // Show summary
    if (failCount === 0) {
      showSuccess(`Updated ${successCount} services successfully!`);
    } else {
      showWarning(
        `Updated ${successCount} services. ${failCount} failed.`
      );
    }
  };

  return (
    <Button onClick={handleBatchUpdate} disabled={processing}>
      {processing ? "Updating..." : `Update ${serviceIds.length} Services`}
    </Button>
  );
}

// ============================================================================
// PATTERN 9: Form Validation with Custom Error Messages
// Use when: You want to show custom validation errors
// ============================================================================

export function FormWithValidation() {
  const { createDoc, loading } = useFrappeCreateDoc();
  const [title, setTitle] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Client-side validation
    if (title.length < 3) {
      showWarning("Title must be at least 3 characters");
      return;
    }

    // Server-side operation
    await handleCreate(
      () => createDoc("Butler Service", { title }),
      "Service"
    );
  };

  return (
    <form onSubmit={handleSubmit}>
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Service Title"
      />
      <Button type="submit" disabled={loading}>
        Create
      </Button>
    </form>
  );
}

// ============================================================================
// PATTERN 10: Page with Multiple Error Sources
// Use when: A page has multiple data sources that can fail
// ============================================================================

export function DashboardPage() {
  const { 
    data: services, 
    error: servicesError 
  } = useFrappeGetDocList("Butler Service");
  
  const { 
    result: stats, 
    error: statsError 
  } = useFrappePostCall("butler.api.get_stats");

  return (
    <div className="space-y-6">
      <h1>Dashboard</h1>

      {/* Show all errors at once */}
      {servicesError && (
        <ErrorBanner error={servicesError} title="Failed to load services" />
      )}
      {statsError && (
        <ErrorBanner error={statsError} title="Failed to load statistics" />
      )}

      {/* Show content even if some parts fail */}
      {services && <div>Services: {services.length}</div>}
      {stats && <div>Stats: {JSON.stringify(stats)}</div>}
    </div>
  );
}
