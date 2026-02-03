import { AmenityCategoryBundle } from './AmenityCategoryBundle'

export interface AmenityCategory{
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
	/**	Category Name : Data	*/
	category_name: string
	/**	Bundles : Table - Amenity Category Bundle	*/
	bundles?: AmenityCategoryBundle[]
	/**	Description : Small Text	*/
	description?: string
	/**	Image : Attach Image	*/
	image?: string
}