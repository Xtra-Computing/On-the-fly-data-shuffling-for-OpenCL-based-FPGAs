//now is the padding 32 case
//#define SW 1
#define PR
#define EOF_FLAG 0xffff
#define PROP_TYPE int
#define kDamp 108//(0.85 << 7)  // * 128

#define VERTEX_MAX  (512*1024)//262144//40960//40960//(128*1024)
#define EDGE_MAX    (2*1024*1024)//5610680////163840 // (1024*1024)
#define BRAM_BANK 16
#define LOG2_BRAM_BANK 4
#define PAD_TYPE int16
#define PAD_WITH 16
#define ENDFLAG 0xffffffff

#define INT2FLOAT (pow(2,28))
int float2int(float a){
	return (int)(a * INT2FLOAT);
}

float int2float(int a){
	return ((float)a / INT2FLOAT);
}

typedef struct EdgeInfo{
	uchar hash_val[8];
	int2 data[8];
} edge_tuples_t;
typedef struct shuffledData{
  uint num;
  uint idx;
  } shuffled_type;

typedef struct filterData{
  bool end;
  uchar num;
  int2 data[8];
  } filter_type;

typedef struct processinfo{
  uint outDeg;
  uint data;
  } process_type;

channel edge_tuples_t edgeInfoCh[16]  __attribute__((depth(128)));
channel int edgeInfoChEof     __attribute__((depth(4)));
channel filter_type toFilterCh[16] __attribute__((depth(128)));
channel int2 buildCh[16] __attribute__((depth(128)));
channel uint filterFlagCh[16] __attribute__((depth(8)));

__attribute__((always_inline)) shuffled_type decoder(uchar opcode){
  uint idx;
  uint num;
  switch(opcode){
     case 0: idx = 0; num = 0; break;
     case 1: idx = 0; num = 1; break;
     case 2: idx = 1; num = 1; break;
     case 3: idx = 8; num = 2; break;
     case 4: idx = 2; num = 1; break;
     case 5: idx = 16; num = 2; break;
     case 6: idx = 17; num = 2; break;
     case 7: idx = 136; num = 3; break;
     case 8: idx = 3; num = 1; break;
     case 9: idx = 24; num = 2; break;
     case 10: idx = 25; num = 2; break;
     case 11: idx = 200; num = 3; break;
     case 12: idx = 26; num = 2; break;
     case 13: idx = 208; num = 3; break;
     case 14: idx = 209; num = 3; break;
     case 15: idx = 1672; num = 4; break;
     case 16: idx = 4; num = 1; break;
     case 17: idx = 32; num = 2; break;
     case 18: idx = 33; num = 2; break;
     case 19: idx = 264; num = 3; break;
     case 20: idx = 34; num = 2; break;
     case 21: idx = 272; num = 3; break;
     case 22: idx = 273; num = 3; break;
     case 23: idx = 2184; num = 4; break;
     case 24: idx = 35; num = 2; break;
     case 25: idx = 280; num = 3; break;
     case 26: idx = 281; num = 3; break;
     case 27: idx = 2248; num = 4; break;
     case 28: idx = 282; num = 3; break;
     case 29: idx = 2256; num = 4; break;
     case 30: idx = 2257; num = 4; break;
     case 31: idx = 18056; num = 5; break;
     case 32: idx = 5; num = 1; break;
     case 33: idx = 40; num = 2; break;
     case 34: idx = 41; num = 2; break;
     case 35: idx = 328; num = 3; break;
     case 36: idx = 42; num = 2; break;
     case 37: idx = 336; num = 3; break;
     case 38: idx = 337; num = 3; break;
     case 39: idx = 2696; num = 4; break;
     case 40: idx = 43; num = 2; break;
     case 41: idx = 344; num = 3; break;
     case 42: idx = 345; num = 3; break;
     case 43: idx = 2760; num = 4; break;
     case 44: idx = 346; num = 3; break;
     case 45: idx = 2768; num = 4; break;
     case 46: idx = 2769; num = 4; break;
     case 47: idx = 22152; num = 5; break;
     case 48: idx = 44; num = 2; break;
     case 49: idx = 352; num = 3; break;
     case 50: idx = 353; num = 3; break;
     case 51: idx = 2824; num = 4; break;
     case 52: idx = 354; num = 3; break;
     case 53: idx = 2832; num = 4; break;
     case 54: idx = 2833; num = 4; break;
     case 55: idx = 22664; num = 5; break;
     case 56: idx = 355; num = 3; break;
     case 57: idx = 2840; num = 4; break;
     case 58: idx = 2841; num = 4; break;
     case 59: idx = 22728; num = 5; break;
     case 60: idx = 2842; num = 4; break;
     case 61: idx = 22736; num = 5; break;
     case 62: idx = 22737; num = 5; break;
     case 63: idx = 181896; num = 6; break;
     case 64: idx = 6; num = 1; break;
     case 65: idx = 48; num = 2; break;
     case 66: idx = 49; num = 2; break;
     case 67: idx = 392; num = 3; break;
     case 68: idx = 50; num = 2; break;
     case 69: idx = 400; num = 3; break;
     case 70: idx = 401; num = 3; break;
     case 71: idx = 3208; num = 4; break;
     case 72: idx = 51; num = 2; break;
     case 73: idx = 408; num = 3; break;
     case 74: idx = 409; num = 3; break;
     case 75: idx = 3272; num = 4; break;
     case 76: idx = 410; num = 3; break;
     case 77: idx = 3280; num = 4; break;
     case 78: idx = 3281; num = 4; break;
     case 79: idx = 26248; num = 5; break;
     case 80: idx = 52; num = 2; break;
     case 81: idx = 416; num = 3; break;
     case 82: idx = 417; num = 3; break;
     case 83: idx = 3336; num = 4; break;
     case 84: idx = 418; num = 3; break;
     case 85: idx = 3344; num = 4; break;
     case 86: idx = 3345; num = 4; break;
     case 87: idx = 26760; num = 5; break;
     case 88: idx = 419; num = 3; break;
     case 89: idx = 3352; num = 4; break;
     case 90: idx = 3353; num = 4; break;
     case 91: idx = 26824; num = 5; break;
     case 92: idx = 3354; num = 4; break;
     case 93: idx = 26832; num = 5; break;
     case 94: idx = 26833; num = 5; break;
     case 95: idx = 214664; num = 6; break;
     case 96: idx = 53; num = 2; break;
     case 97: idx = 424; num = 3; break;
     case 98: idx = 425; num = 3; break;
     case 99: idx = 3400; num = 4; break;
     case 100: idx = 426; num = 3; break;
     case 101: idx = 3408; num = 4; break;
     case 102: idx = 3409; num = 4; break;
     case 103: idx = 27272; num = 5; break;
     case 104: idx = 427; num = 3; break;
     case 105: idx = 3416; num = 4; break;
     case 106: idx = 3417; num = 4; break;
     case 107: idx = 27336; num = 5; break;
     case 108: idx = 3418; num = 4; break;
     case 109: idx = 27344; num = 5; break;
     case 110: idx = 27345; num = 5; break;
     case 111: idx = 218760; num = 6; break;
     case 112: idx = 428; num = 3; break;
     case 113: idx = 3424; num = 4; break;
     case 114: idx = 3425; num = 4; break;
     case 115: idx = 27400; num = 5; break;
     case 116: idx = 3426; num = 4; break;
     case 117: idx = 27408; num = 5; break;
     case 118: idx = 27409; num = 5; break;
     case 119: idx = 219272; num = 6; break;
     case 120: idx = 3427; num = 4; break;
     case 121: idx = 27416; num = 5; break;
     case 122: idx = 27417; num = 5; break;
     case 123: idx = 219336; num = 6; break;
     case 124: idx = 27418; num = 5; break;
     case 125: idx = 219344; num = 6; break;
     case 126: idx = 219345; num = 6; break;
     case 127: idx = 1754760; num = 7; break;
     case 128: idx = 7; num = 1; break;
     case 129: idx = 56; num = 2; break;
     case 130: idx = 57; num = 2; break;
     case 131: idx = 456; num = 3; break;
     case 132: idx = 58; num = 2; break;
     case 133: idx = 464; num = 3; break;
     case 134: idx = 465; num = 3; break;
     case 135: idx = 3720; num = 4; break;
     case 136: idx = 59; num = 2; break;
     case 137: idx = 472; num = 3; break;
     case 138: idx = 473; num = 3; break;
     case 139: idx = 3784; num = 4; break;
     case 140: idx = 474; num = 3; break;
     case 141: idx = 3792; num = 4; break;
     case 142: idx = 3793; num = 4; break;
     case 143: idx = 30344; num = 5; break;
     case 144: idx = 60; num = 2; break;
     case 145: idx = 480; num = 3; break;
     case 146: idx = 481; num = 3; break;
     case 147: idx = 3848; num = 4; break;
     case 148: idx = 482; num = 3; break;
     case 149: idx = 3856; num = 4; break;
     case 150: idx = 3857; num = 4; break;
     case 151: idx = 30856; num = 5; break;
     case 152: idx = 483; num = 3; break;
     case 153: idx = 3864; num = 4; break;
     case 154: idx = 3865; num = 4; break;
     case 155: idx = 30920; num = 5; break;
     case 156: idx = 3866; num = 4; break;
     case 157: idx = 30928; num = 5; break;
     case 158: idx = 30929; num = 5; break;
     case 159: idx = 247432; num = 6; break;
     case 160: idx = 61; num = 2; break;
     case 161: idx = 488; num = 3; break;
     case 162: idx = 489; num = 3; break;
     case 163: idx = 3912; num = 4; break;
     case 164: idx = 490; num = 3; break;
     case 165: idx = 3920; num = 4; break;
     case 166: idx = 3921; num = 4; break;
     case 167: idx = 31368; num = 5; break;
     case 168: idx = 491; num = 3; break;
     case 169: idx = 3928; num = 4; break;
     case 170: idx = 3929; num = 4; break;
     case 171: idx = 31432; num = 5; break;
     case 172: idx = 3930; num = 4; break;
     case 173: idx = 31440; num = 5; break;
     case 174: idx = 31441; num = 5; break;
     case 175: idx = 251528; num = 6; break;
     case 176: idx = 492; num = 3; break;
     case 177: idx = 3936; num = 4; break;
     case 178: idx = 3937; num = 4; break;
     case 179: idx = 31496; num = 5; break;
     case 180: idx = 3938; num = 4; break;
     case 181: idx = 31504; num = 5; break;
     case 182: idx = 31505; num = 5; break;
     case 183: idx = 252040; num = 6; break;
     case 184: idx = 3939; num = 4; break;
     case 185: idx = 31512; num = 5; break;
     case 186: idx = 31513; num = 5; break;
     case 187: idx = 252104; num = 6; break;
     case 188: idx = 31514; num = 5; break;
     case 189: idx = 252112; num = 6; break;
     case 190: idx = 252113; num = 6; break;
     case 191: idx = 2016904; num = 7; break;
     case 192: idx = 62; num = 2; break;
     case 193: idx = 496; num = 3; break;
     case 194: idx = 497; num = 3; break;
     case 195: idx = 3976; num = 4; break;
     case 196: idx = 498; num = 3; break;
     case 197: idx = 3984; num = 4; break;
     case 198: idx = 3985; num = 4; break;
     case 199: idx = 31880; num = 5; break;
     case 200: idx = 499; num = 3; break;
     case 201: idx = 3992; num = 4; break;
     case 202: idx = 3993; num = 4; break;
     case 203: idx = 31944; num = 5; break;
     case 204: idx = 3994; num = 4; break;
     case 205: idx = 31952; num = 5; break;
     case 206: idx = 31953; num = 5; break;
     case 207: idx = 255624; num = 6; break;
     case 208: idx = 500; num = 3; break;
     case 209: idx = 4000; num = 4; break;
     case 210: idx = 4001; num = 4; break;
     case 211: idx = 32008; num = 5; break;
     case 212: idx = 4002; num = 4; break;
     case 213: idx = 32016; num = 5; break;
     case 214: idx = 32017; num = 5; break;
     case 215: idx = 256136; num = 6; break;
     case 216: idx = 4003; num = 4; break;
     case 217: idx = 32024; num = 5; break;
     case 218: idx = 32025; num = 5; break;
     case 219: idx = 256200; num = 6; break;
     case 220: idx = 32026; num = 5; break;
     case 221: idx = 256208; num = 6; break;
     case 222: idx = 256209; num = 6; break;
     case 223: idx = 2049672; num = 7; break;
     case 224: idx = 501; num = 3; break;
     case 225: idx = 4008; num = 4; break;
     case 226: idx = 4009; num = 4; break;
     case 227: idx = 32072; num = 5; break;
     case 228: idx = 4010; num = 4; break;
     case 229: idx = 32080; num = 5; break;
     case 230: idx = 32081; num = 5; break;
     case 231: idx = 256648; num = 6; break;
     case 232: idx = 4011; num = 4; break;
     case 233: idx = 32088; num = 5; break;
     case 234: idx = 32089; num = 5; break;
     case 235: idx = 256712; num = 6; break;
     case 236: idx = 32090; num = 5; break;
     case 237: idx = 256720; num = 6; break;
     case 238: idx = 256721; num = 6; break;
     case 239: idx = 2053768; num = 7; break;
     case 240: idx = 4012; num = 4; break;
     case 241: idx = 32096; num = 5; break;
     case 242: idx = 32097; num = 5; break;
     case 243: idx = 256776; num = 6; break;
     case 244: idx = 32098; num = 5; break;
     case 245: idx = 256784; num = 6; break;
     case 246: idx = 256785; num = 6; break;
     case 247: idx = 2054280; num = 7; break;
     case 248: idx = 32099; num = 5; break;
     case 249: idx = 256792; num = 6; break;
     case 250: idx = 256793; num = 6; break;
     case 251: idx = 2054344; num = 7; break;
     case 252: idx = 256794; num = 6; break;
     case 253: idx = 2054352; num = 7; break;
     case 254: idx = 2054353; num = 7; break;
     case 255: idx = 16434824; num = 8; break;
     default: idx = 0; num = 0; break;
 }
 shuffled_type data;
 data.idx = idx;
 data.num = num;
 return data;
}

// The idea is tuple with <dstVertex, score> format load from DDR and then use FPGA to update

// read edge tuples to gather kernel
__kernel void __attribute__((task)) readEdges(
        __global int*  restrict vertexScore,
        __global int*  restrict edgeScoreMap,
		__global int*  restrict edges,
		__global uint*  restrict readInfo
		)
{	
	uint offset = readInfo[0];
	uint end = readInfo[1];
    int mapidx_old[8];
    int score_old[8];

	for(int i = (offset); i < (end); i += 8){
        int2 edge_tmp[8];
        #pragma unroll 8
        for(int k = 0; k < 8; k ++){
            edge_tmp[k].x = edges[i+k];
            int mapidx = edgeScoreMap[i+k];
            
            if(mapidx_old[k] == mapidx)
                edge_tmp[k].y = score_old[k] ;
            else 
                edge_tmp[k].y = vertexScore[mapidx];

            score_old[k] = edge_tmp[k].y;

        }

        //if (edge_tmp[7].x == ENDFLAG) printf("read idx %d, edge %d, value %x\n", i, edge_tmp[7].x, edge_tmp[7].x);
		edge_tuples_t tuples;
        #pragma unroll 8
        for(int k = 0; k < 8; k ++){
            tuples.data[k] = edge_tmp[k];
            tuples.hash_val[k] = edge_tmp[k].x & 0x0f;
        }
		
        #pragma unroll 16
		for(int i = 0; i < 16; i ++){
			write_channel_altera(edgeInfoCh[i], tuples);
		}
	}
}


__attribute__((task))
__kernel void gather ()                
{
    bool engine_finish[16];  
   #pragma unroll 16
    for(int j = 0; j < 16; j ++)
      engine_finish[j] = false;

  	while(true){
      #pragma unroll 16
        for(int i = 0; i < 16; i ++){ 
        // each collect engine do their work
            int16 data_r;
            bool valid_c;
            bool valid_r[8];
            uchar idx[8];
            #pragma unroll 8
            for(int i = 0; i < 8; i ++){
               valid_r[i] = false;
            }
            #pragma unroll 8
            for(int i = 0; i < 8; i ++){
               idx[i] = false;
            }
          
            edge_tuples_t tuples = read_channel_altera(edgeInfoCh[i]);
           
            //data_r = tuples.data;
            valid_r[0] = tuples.hash_val[0] == i ? 1:0;
            valid_r[1] = tuples.hash_val[1] == i ? 1:0;
            valid_r[2] = tuples.hash_val[2] == i ? 1:0;
            valid_r[3] = tuples.hash_val[3] == i ? 1:0;
            valid_r[4] = tuples.hash_val[4] == i ? 1:0;
            valid_r[5] = tuples.hash_val[5] == i ? 1:0;
            valid_r[6] = tuples.hash_val[6] == i ? 1:0;
            valid_r[7] = tuples.hash_val[7] == i ? 1:0;


            uchar opcode = valid_r[0] + (valid_r[1] << 1) + (valid_r[2] << 2) + (valid_r[3] << 3) + (valid_r[4] << 4) + (valid_r[5] << 5) + (valid_r[6] << 6)
                + (valid_r[7] << 7);
                
            shuffled_type shuff_ifo = decoder(opcode);
  
            filter_type filter;
            filter.num = shuff_ifo.num;
            idx[0] = shuff_ifo.idx & 0x7;
            idx[1] = (shuff_ifo.idx >> 3) & 0x7;
            idx[2] = (shuff_ifo.idx >> 6) & 0x7;
            idx[3] = (shuff_ifo.idx >> 9) & 0x7;
            idx[4] = (shuff_ifo.idx >> 12) & 0x7;
            idx[5] = (shuff_ifo.idx >> 15) & 0x7;
            idx[6] = (shuff_ifo.idx >> 18) & 0x7;
            idx[7] = (shuff_ifo.idx >> 21) & 0x7;

            if(tuples.data[7].x == ENDFLAG){
              filter.end = 1; //printf("end !\n");
            }
            else
              filter.end = 0;
/*
            int2 data_r_uint2[8];
            data_r_uint2[0].x = data_r.s0;
            data_r_uint2[0].y = data_r.s1;
            data_r_uint2[1].x = data_r.s2;
            data_r_uint2[1].y = data_r.s3;
            data_r_uint2[2].x = data_r.s4;
            data_r_uint2[2].y = data_r.s5;
            data_r_uint2[3].x = data_r.s6;
            data_r_uint2[3].y = data_r.s7;
            data_r_uint2[4].x = data_r.s8;
            data_r_uint2[4].y = data_r.s9;
            data_r_uint2[5].x = data_r.sa;
            data_r_uint2[5].y = data_r.sb;
            data_r_uint2[6].x = data_r.sc;
            data_r_uint2[6].y = data_r.sd;
            data_r_uint2[7].x = data_r.se;
            data_r_uint2[7].y = data_r.sf;
*/

           #pragma unroll 8
            for(int j = 0; j < 8; j ++){  
                uchar idx_t = idx[j];
                filter.data[j] = tuples.data[idx_t];  //data_r_uint2[idx_t];
            }
            if(opcode | (tuples.data[7].x == ENDFLAG)){
                write_channel_altera(toFilterCh[i], filter);
            }
        }
    }   
}

__attribute__((task))
__kernel void filter(){

    while(true){ 
      filter_type filter = read_channel_altera(toFilterCh[0]);
      if(filter.end){
        write_channel_altera(filterFlagCh[0], ENDFLAG);
        
      }
      else{
        for(int j = 0; j < filter.num; j ++){ 
            write_channel_altera(buildCh[0], filter.data[j]);
        }
      }
    }
}
__attribute__((task))
__kernel void filter1(){

    while(true){ 
      filter_type filter = read_channel_altera(toFilterCh[1]);
      if(filter.end){
        write_channel_altera(filterFlagCh[1], ENDFLAG);
       
      }
      else{
        for(int j = 0; j < filter.num; j ++){ 
            write_channel_altera(buildCh[1], filter.data[j]);
        }
      }
    }
}

__attribute__((task))
__kernel void filter2(){

    while(true){ 
      filter_type filter = read_channel_altera(toFilterCh[2]);
      if(filter.end){
        write_channel_altera(filterFlagCh[2], ENDFLAG);
        
      }
      else{
        for(int j = 0; j < filter.num; j ++){ 
            write_channel_altera(buildCh[2], filter.data[j]);
        }
      }
    }
}

__attribute__((task))
__kernel void filter3(){

    while(true){ 
      filter_type filter = read_channel_altera(toFilterCh[3]);
      if(filter.end){
        write_channel_altera(filterFlagCh[3], ENDFLAG);
        
      }
      else{
        for(int j = 0; j < filter.num; j ++){ 
            write_channel_altera(buildCh[3], filter.data[j]);
        }
      }
    }
}

__attribute__((task))
__kernel void filter4(){

    while(true){ 
      filter_type filter = read_channel_altera(toFilterCh[4]);
      if(filter.end){
        write_channel_altera(filterFlagCh[4], ENDFLAG);
       
      }
      else{
        for(int j = 0; j < filter.num; j ++){ 
            write_channel_altera(buildCh[4], filter.data[j]);
        }
      }
    }
}

__attribute__((task))
__kernel void filter5(){

    while(true){ 
      filter_type filter = read_channel_altera(toFilterCh[5]);
      if(filter.end){
        write_channel_altera(filterFlagCh[5], ENDFLAG);
        
      }
      else{
        for(int j = 0; j < filter.num; j ++){ 
            write_channel_altera(buildCh[5], filter.data[j]);
        }
      }
    }
}

__attribute__((task))
__kernel void filter6(){

    while(true){ 
      filter_type filter = read_channel_altera(toFilterCh[6]);
      if(filter.end){
        write_channel_altera(filterFlagCh[6], ENDFLAG);
        
      }
      else{
        for(int j = 0; j < filter.num; j ++){ 
            write_channel_altera(buildCh[6], filter.data[j]);
        }
      }
    }
}

__attribute__((task))
__kernel void filter7(){

    while(true){ 
      filter_type filter = read_channel_altera(toFilterCh[7]);
      if(filter.end){
        write_channel_altera(filterFlagCh[7], ENDFLAG);
        
      }
      else{
        for(int j = 0; j < filter.num; j ++){ 
            write_channel_altera(buildCh[7], filter.data[j]);
        }
      }
    }
}

__attribute__((task))
__kernel void filter8(){

    while(true){ 
      filter_type filter = read_channel_altera(toFilterCh[8]);
      if(filter.end){
        write_channel_altera(filterFlagCh[8], ENDFLAG);
        
      }
      else{
        for(int j = 0; j < filter.num; j ++){ 
            write_channel_altera(buildCh[8], filter.data[j]);
        }
      }
    }
}

__attribute__((task))
__kernel void filter9(){

    while(true){ 
      filter_type filter = read_channel_altera(toFilterCh[9]);
      if(filter.end){
        write_channel_altera(filterFlagCh[9], ENDFLAG);
        
      }
      else{
        for(int j = 0; j < filter.num; j ++){ 
            write_channel_altera(buildCh[9], filter.data[j]);
        }
      }
    }
}

__attribute__((task))
__kernel void filter10(){

    while(true){ 
      filter_type filter = read_channel_altera(toFilterCh[10]);
      if(filter.end){
        write_channel_altera(filterFlagCh[10], ENDFLAG);
        
      }
      else{
        for(int j = 0; j < filter.num; j ++){ 
            write_channel_altera(buildCh[10], filter.data[j]);
        }
      }
    }
}

__attribute__((task))
__kernel void filter11(){

    while(true){ 
      filter_type filter = read_channel_altera(toFilterCh[11]);
      if(filter.end){
        write_channel_altera(filterFlagCh[11], ENDFLAG);
       
      }
      else{
        for(int j = 0; j < filter.num; j ++){ 
            write_channel_altera(buildCh[11], filter.data[j]);
        }
      }
    }
}

__attribute__((task))
__kernel void filter12(){

    while(true){ 
      filter_type filter = read_channel_altera(toFilterCh[12]);
      if(filter.end){
        write_channel_altera(filterFlagCh[12], ENDFLAG);
        
      }
      else{
        for(int j = 0; j < filter.num; j ++){ 
            write_channel_altera(buildCh[12], filter.data[j]);
        }
      }
    }
}

__attribute__((task))
__kernel void filter13(){

    while(true){ 
      filter_type filter = read_channel_altera(toFilterCh[13]);
      if(filter.end){
        write_channel_altera(filterFlagCh[13], ENDFLAG);
        
      }
      else{
        for(int j = 0; j < filter.num; j ++){ 
            write_channel_altera(buildCh[13], filter.data[j]);
        }
      }
    }
}

__attribute__((task))
__kernel void filter14(){

    while(true){ 
      filter_type filter = read_channel_altera(toFilterCh[14]);
      if(filter.end){
        write_channel_altera(filterFlagCh[14], ENDFLAG);
        
      }
      else{
        for(int j = 0; j < filter.num; j ++){ 
            write_channel_altera(buildCh[14], filter.data[j]);
        }
      }
    }
}

__attribute__((task))
__kernel void filter15(){

    while(true){ 
      filter_type filter = read_channel_altera(toFilterCh[15]);
      if(filter.end){
        write_channel_altera(filterFlagCh[15], ENDFLAG);
       
      }
      else{
        for(int j = 0; j < filter.num; j ++){ 
            write_channel_altera(buildCh[15], filter.data[j]);
        }
      }
    }
}

__kernel void __attribute__((task)) processEdges(
		__global int16* restrict tmpVertexProp,
		__global const int* restrict sinkRange
		)
{	
	uint dstStart = sinkRange[0];
	uint dstEnd   = sinkRange[1];

    uint vertexNum = dstEnd - dstStart;

	int tmpVPropBuffer [VERTEX_MAX >> 4][16];
 // load the vertex property to BRAM 
/*  
	for(int k = 0; k < (VERTEX_MAX >> 4); k ++){
		#pragma unroll 16
		for(int i = 0; i < 16; i ++){
			tmpVPropBuffer[k][i] = 0;//tmpVertexProp[k + i];		
		}
	}
*/
	bool engine_finish[16]; 
    uint filterEndFlag[16]; 

 	#pragma unroll 16
    for(int j = 0; j < 16; j ++){
      engine_finish[j] = false;
      filterEndFlag[j] = false;
    }

    while(true){
      #pragma unroll 16
        for(int i = 0; i < 16; i ++){ 
        // each collect engine do their work
        // low is active
            int2 tmp_data = read_channel_nb_altera (buildCh[i], &engine_finish[i]);
            if(engine_finish[i]){
            	int dstVidx  = tmp_data.x; 
             	int score  = tmp_data.y;
             	//printf("dstVidx %d \n", dstVidx);
			 	int idx = (dstVidx - dstStart) >> LOG2_BRAM_BANK;
			 	tmpVPropBuffer[idx][i] += score;
            }

          	bool valid_endflag;
          	uint tmp_flag = read_channel_nb_altera (filterFlagCh[i], &valid_endflag);
          	if(valid_endflag) filterEndFlag[i] = tmp_flag;
        }
      // low is active
      bool all_finish = engine_finish[0] | engine_finish[1] | engine_finish[2] | engine_finish[3] | 
                        engine_finish[4] | engine_finish[5] | engine_finish[6] | engine_finish[7] |
                        engine_finish[8] | engine_finish[9] | engine_finish[10] | engine_finish[11] | 
                        engine_finish[12] | engine_finish[13] | engine_finish[14] | engine_finish[15];

      uint valid_endflag = filterEndFlag[0] & filterEndFlag[1]& filterEndFlag[2] & filterEndFlag[3] & 
                        filterEndFlag[4] & filterEndFlag[5] & filterEndFlag[6] & filterEndFlag[7] &
                        filterEndFlag[8] & filterEndFlag[9]& filterEndFlag[10] & filterEndFlag[11] & 
                        filterEndFlag[12] & filterEndFlag[13] & filterEndFlag[14] & filterEndFlag[15] ;

      if(valid_endflag == ENDFLAG && !all_finish) break; 
    }

	// store back to DDR.
	for(int k = 0; k < (vertexNum >> 4); k ++){

		int16 tmpVertexProp_int16;
		tmpVertexProp_int16.s0 = tmpVPropBuffer[k][0];
		tmpVertexProp_int16.s1 = tmpVPropBuffer[k][1];
		tmpVertexProp_int16.s2 = tmpVPropBuffer[k][2];
		tmpVertexProp_int16.s3 = tmpVPropBuffer[k][3];
		tmpVertexProp_int16.s4 = tmpVPropBuffer[k][4];
		tmpVertexProp_int16.s5 = tmpVPropBuffer[k][5];
		tmpVertexProp_int16.s6 = tmpVPropBuffer[k][6];
		tmpVertexProp_int16.s7 = tmpVPropBuffer[k][7];
		tmpVertexProp_int16.s8 = tmpVPropBuffer[k][8];
		tmpVertexProp_int16.s9 = tmpVPropBuffer[k][9];
		tmpVertexProp_int16.sa = tmpVPropBuffer[k][10];
		tmpVertexProp_int16.sb = tmpVPropBuffer[k][11];
		tmpVertexProp_int16.sc = tmpVPropBuffer[k][12];
		tmpVertexProp_int16.sd = tmpVPropBuffer[k][13];
		tmpVertexProp_int16.se = tmpVPropBuffer[k][14];
		tmpVertexProp_int16.sf = tmpVPropBuffer[k][15];

		tmpVertexProp[(dstStart >> 4)+ k] = tmpVertexProp_int16;
		
        tmpVPropBuffer[k][0] = 0;
        tmpVPropBuffer[k][1] = 0;
        tmpVPropBuffer[k][2] = 0;
        tmpVPropBuffer[k][3] = 0;
        tmpVPropBuffer[k][4] = 0;
        tmpVPropBuffer[k][5] = 0;
        tmpVPropBuffer[k][6] = 0;
        tmpVPropBuffer[k][7] = 0;
        tmpVPropBuffer[k][8] = 0;
        tmpVPropBuffer[k][9] = 0;
        tmpVPropBuffer[k][10] = 0;
        tmpVPropBuffer[k][11] = 0;
        tmpVPropBuffer[k][12] = 0;
        tmpVPropBuffer[k][13] = 0;
        tmpVPropBuffer[k][14] = 0;
        tmpVPropBuffer[k][15] = 0;
		// cannot work the unroll version -- do not know the reason 
		/*
		#pragma unroll 16
		for(int i = 0; i < 16; i ++){
			tmpVertexProp[k + i] = tmpVPropBuffer[k][i];		
		}
		*/
	}


}

__kernel void __attribute__((task)) vertexApply(
		__global int* restrict vertexProp,
		__global int* restrict tmpVertexProp,
		__global int* restrict outDeg,
		__global int* restrict vertexScore,
		__global int* restrict error,
		const int vertexNum,
		const int base_score
		)
{	
	  int error_l[8] = {0};
#pragma unroll 8
	for(int i = 0; i < vertexNum; i++){
		int tProp = tmpVertexProp[i];
		int old_score = vertexProp[i];
		int out_deg = outDeg[i];
		int new_score = base_score + ((kDamp * tProp) >> 7);

		vertexProp[i] = new_score;
		error_l[i & 0x7] += (new_score - old_score) > 0? (new_score - old_score) : (old_score - new_score) ;
		if(out_deg) vertexScore[i] = new_score/out_deg;
	}

  int total_error = 0;
#pragma unroll 8
  for(int i = 0; i < 8; i ++)
	  total_error += error_l[i];
    
  error[0] = total_error;
}
