import mongoose from "mongoose";

const connectDB = async()=>{
     try {
        await mongoose.connect(process.env.MONGO_URL)
        console.log("La  connexion  reussie !")
     } catch (error) {
        console.log("La connexion  echouee!")
     }
}

export {connectDB}