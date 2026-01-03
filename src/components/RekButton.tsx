import { motion } from "framer-motion";
import { useRouter } from "next/router";

export default function RekButton() {
  const router = useRouter();

  const handleClick = () => {
    router.push("/rek");
  };

  return (
    <div className="flex flex-col items-center justify-center mt-10 mb-16">
      <motion.div
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        animate={{ 
          scale: [1, 1.05, 1],
          boxShadow: [
            "0 0 0px rgba(0,0,0,0)",
            "0 0 30px rgba(0,150,255,0.4)",
            "0 0 0px rgba(0,0,0,0)"
          ]
        }}
        transition={{ repeat: Infinity, duration: 2 }}
        onClick={handleClick}
        className="w-40 h-40 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center cursor-pointer select-none"
      >
        <span className="text-white text-3xl font-bold tracking-widest">R</span>
      </motion.div>

      <div className="text-center mt-4">
        <p className="text-gray-200 text-sm uppercase tracking-wide">
          Point • Rek • Discover
        </p>
        <p className="text-gray-400 text-xs mt-1">
          Powered by <span className="font-semibold text-gray-300">Reks Ray™</span>
        </p>
      </div>
    </div>
  );
}
