
export interface Facility{
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
	/**	Facility For : Link - DocType	*/
	facility_for: string
	/**	Party : Dynamic Link	*/
	party_name: string
	/**	Customer Name : Data	*/
	customer_name?: string
	/**	Facility Type : Link - Facility Type	*/
	facility_type: string
	/**	Facility Name : Data	*/
	facility_name: string
	/**	Multi-storey : Check	*/
	multistorey?: 0 | 1
	/**	Number of Floors : Int	*/
	number_of_floors?: number
	/**	Floor Area : Float	*/
	floor_area?: number
	/**	Total Area (m<sup>2</sup>) : Float	*/
	total_area?: number
	/**	Facility Blueprint : Attach	*/
	facility_blueprint?: string
	/**	Street : Data	*/
	street?: string
	/**	Building No : Data	*/
	building_no?: string
	/**	National Address : Attach	*/
	facility_national_address?: string
	/**	Address Details : Small Text	*/
	address_details?: string
	/**	Location : Geolocation	*/
	location?: any
	/**	Latitude : Float	*/
	latitude?: number
	/**	Longitude : Float	*/
	longitude?: number
}