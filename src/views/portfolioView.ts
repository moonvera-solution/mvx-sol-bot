
import { UserPositions } from '../db';


export async function display_spl_positions(){
    const allPositions = await UserPositions.find({});
    console.log(allPositions);

}