
export interface AmenityCategoryBundle{
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
	/**	Bundle Name : Link - Butler Bundle	*/
	bundle_name: string
	/**	Number of Amenities : Int	*/
	number_of_amenities: number
}