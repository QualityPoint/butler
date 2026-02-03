import { BundleSpecifications } from './BundleSpecifications'
import { FacilityAmenities } from './FacilityAmenities'

export interface ServiceOrder{
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
	/**	Series : Select	*/
	naming_series: "SRV-ORD-.YYYY.-"
	/**	Facility : Link - Facility	*/
	facility: string
	/**	Facility Type : Link - Facility Type	*/
	facility_type?: string
	/**	Order Date : Date	*/
	order_date: string
	/**	Order Type : Select	*/
	order_type: "" | "Bundle" | "Quotation" | "Amenities"
	/**	Bundle Type : Link - Butler Bundle	*/
	bundle_type?: string
	/**	Amended From : Link - Service Order	*/
	amended_from?: string
	/**	Multi-storey : Check	*/
	multistorey?: 0 | 1
	/**	Number of Floors : Int	*/
	number_of_floors?: number
	/**	Floor Area : Float	*/
	floor_area?: number
	/**	Total Area (m<sup>2</sup>) : Float	*/
	total_area?: number
	/**	Bundle Price : Currency	*/
	bundle_price?: number
	/**	Amenity Categories : Table - Bundle Specifications	*/
	amenity_categories?: BundleSpecifications[]
	/**	Amenities : Table - Facility Amenities	*/
	amenities: FacilityAmenities[]
	/**	Amenity Count : Int	*/
	amenity_count?: number
	/**	Discount (%) : Percent	*/
	discount?: number
	/**	Total : Currency	*/
	total?: number
	/**	Grand Total : Currency	*/
	grand_total?: number
}