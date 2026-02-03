
export interface FacilityAmenities{
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
	/**	Amenity Name : Link - Amenity	*/
	amenity_name: string
	/**	Amenity Category : Link - Amenity Category	*/
	amenity_category?: string
	/**	Count : Int	*/
	count: number
	/**	Price : Currency	*/
	price?: number
	/**	Amount : Currency	*/
	amount?: number
	/**	Image : Image	*/
	image?: string
	/**	Requires Number of Floors : Check	*/
	requires_number_of_floors?: 0 | 1
	/**	Is Dependant Amenity : Check	*/
	is_dependant_amenity?: 0 | 1
	/**	Has Varied Price : Check	*/
	has_varied_price?: 0 | 1
}