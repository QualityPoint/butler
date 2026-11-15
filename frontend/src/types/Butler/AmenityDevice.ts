
export interface AmenityDevice{
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
	/**	Device Item : Link - Item - The item must be of a non-stock type	*/
	device_item: string
	/**	Device Name : Data	*/
	device_name: string
	/**	Image : Attach Image	*/
	image?: string
	/**	Description : Small Text	*/
	description?: string
}