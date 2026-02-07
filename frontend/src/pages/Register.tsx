import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useFrappeCreateDoc, useFrappeGetDocList } from "frappe-react-sdk";
import { Button } from "@/components/retroui/Button";
import { Home } from "lucide-react";
import { showSuccess, showWarning, showFrappeError } from "@/lib/errorHandler";
import type { Lead } from "@/types/CRM/Lead";

export default function Register() {
  const navigate = useNavigate();
  const { createDoc } = useFrappeCreateDoc();
  
  // Fetch salutation options from Salutation DocType
  const { data: salutations, isLoading: salutationsLoading } = useFrappeGetDocList<{
    name: string;
  }>("Salutation", {
    fields: ["name"],
    limit: 100,
  });

  const [formData, setFormData] = useState({
    salutation: "",
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Basic validation
    if (
      !formData.salutation ||
      !formData.firstName ||
      !formData.lastName ||
      !formData.phone
    ) {
      showWarning("Please fill in all required fields");
      return;
    }

    setIsSubmitting(true);

    try {
      // Create Lead document in ERPNext
      const leadData: Partial<Lead> = {
        salutation: formData.salutation,
        first_name: formData.firstName,
        last_name: formData.lastName,
        email_id: formData.email || undefined,
        mobile_no: formData.phone,
        status: "Lead",
        lead_name: `${formData.firstName} ${formData.lastName}`,
      };

      const newLead = await createDoc("Lead", leadData);
      console.log("Lead created:", newLead);

      showSuccess("Registration successful! Redirecting to facilities...");

      // Navigate to facilities page after successful registration
      setTimeout(() => {
        navigate(`/facilities?lead_id=${newLead.name}&facility_for=Lead`);
      }, 1500);
    } catch (error) {
      console.error("Registration failed:", error);
      showFrappeError(error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="bg-primary border-4 border-border p-4 sm:p-6 shadow-xl mb-8">
          <div className="flex flex-col sm:flex-row items-center gap-3 sm:gap-4 justify-center">
            <img
              src="/assets/butler/images/logo.svg"
              alt="Butler Logo"
              className="h-16 w-16 sm:h-20 sm:w-20 flex-shrink-0"
            />
            <div className="text-center sm:text-left max-w-2xl">
              <h1 className="text-xl sm:text-2xl md:text-3xl lg:text-4xl font-head break-words">
                New Customer Registration
              </h1>
              <p className="mt-1 sm:mt-2 font-sans text-sm sm:text-base break-words">
                Fill in your details to get started
              </p>
            </div>
          </div>
        </div>

        {/* Registration Form */}
        <div className="bg-card border-4 border-border p-8 shadow-lg">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Salutation Field */}
            <div>
              <label htmlFor="salutation" className="block font-head mb-2">
                Salutation <span className="text-destructive">*</span>
              </label>
              <select
                id="salutation"
                name="salutation"
                required
                value={formData.salutation}
                onChange={handleInputChange as any}
                className="w-full px-4 py-3 border-4 border-border font-sans focus:outline-none focus:ring-4 focus:ring-primary bg-white"
                disabled={salutationsLoading}
              >
                <option value="">
                  {salutationsLoading ? "Loading..." : "Select Salutation"}
                </option>
                {salutations?.map((salutation) => (
                  <option key={salutation.name} value={salutation.name}>
                    {salutation.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Name Fields */}
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <label htmlFor="firstName" className="block font-head mb-2">
                  First Name <span className="text-destructive">*</span>
                </label>
                <input
                  id="firstName"
                  name="firstName"
                  type="text"
                  required
                  value={formData.firstName}
                  onChange={handleInputChange}
                  className="w-full px-4 py-3 border-4 border-border font-sans focus:outline-none focus:ring-4 focus:ring-primary"
                  placeholder="John"
                />
              </div>

              <div>
                <label htmlFor="lastName" className="block font-head mb-2">
                  Last Name <span className="text-destructive">*</span>
                </label>
                <input
                  id="lastName"
                  name="lastName"
                  type="text"
                  required
                  value={formData.lastName}
                  onChange={handleInputChange}
                  className="w-full px-4 py-3 border-4 border-border font-sans focus:outline-none focus:ring-4 focus:ring-primary"
                  placeholder="Doe"
                />
              </div>
            </div>

            {/* Contact Fields */}
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <label htmlFor="phone" className="block font-head mb-2">
                  Phone <span className="text-destructive">*</span>
                </label>
                <input
                  id="phone"
                  name="phone"
                  type="tel"
                  required
                  value={formData.phone}
                  onChange={handleInputChange}
                  className="w-full px-4 py-3 border-4 border-border font-sans focus:outline-none focus:ring-4 focus:ring-primary"
                  placeholder="+1234567890"
                />
              </div>

              <div>
                <label htmlFor="email" className="block font-head mb-2">
                  Email
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  className="w-full px-4 py-3 border-4 border-border font-sans focus:outline-none focus:ring-4 focus:ring-primary"
                  placeholder="john@example.com"
                />
              </div>
            </div>

            {/* Submit Button */}
            <div className="flex flex-wrap gap-2 sm:gap-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate("/")}
                className="flex-1 min-w-[100px] text-sm sm:text-base"
                disabled={isSubmitting}
              >
                <Home className="w-4 h-4 sm:mr-2" />
                <span className="hidden sm:inline">Home</span>
              </Button>
              <Button
                type="submit"
                className="flex-1 min-w-[140px] text-base sm:text-lg"
                disabled={isSubmitting}
              >
                {isSubmitting ? "Registering..." : "Complete Registration"}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
