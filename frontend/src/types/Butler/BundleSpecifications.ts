
export interface BundleSpecifications {
	name: string
	creation: string
	modified: string
	owner: string
	modified_by: string
	docstatus: 0 | 1 | 2
	parent?: string
	parentfield?: string
	parenttype?: string
	idx?: number
	/**	Amenity Category : Link - Amenity Category	*/
	amenity_category?: string
	/**	Number of Amenities : Int	*/
	amenity_count?: number
}