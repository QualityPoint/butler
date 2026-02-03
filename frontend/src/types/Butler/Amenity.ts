import { AmenityDependsOn } from './AmenityDependsOn'
import { FacilityPrices } from './FacilityPrices'
import { Annexes } from './Annexes'

export interface Amenity{
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
	/**	Amenity Item : Link - Item - The item must be of a non-stock type	*/
	amenity_item: string
	/**	Amenity Name : Data	*/
	amenity_name: string
	/**	Amenity Category : Link - Amenity Category	*/
	amenity_category: string
	/**	Disabled : Check	*/
	disabled?: 0 | 1
	/**	Is Dependant Amenity : Check	*/
	is_dependant_amenity?: 0 | 1
	/**	Primary Amenities : Table - Amenity Depends On	*/
	depends_on?: AmenityDependsOn[]
	/**	Image : Attach Image	*/
	image?: string
	/**	Lines : Int	*/
	lines: number
	/**	Requires Number of Floors : Check	*/
	requires_number_of_floors?: 0 | 1
	/**	Amenity Price : Currency	*/
	amenity_price: number
	/**	Has Varied Price : Check	*/
	has_varied_price?: 0 | 1
	/**	Facility Prices : Table - Facility Prices	*/
	facility_prices?: FacilityPrices[]
	/**	Annexes : Table - Annexes	*/
	annexes?: Annexes[]
}