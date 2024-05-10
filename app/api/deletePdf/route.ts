import { NextResponse } from 'next/server';
import {deleteFile} from '../utils/cdn'
import prisma from '@/utils/prisma';
import { getAuth } from '@clerk/nextjs/server';
import { loadEmbeddingsModel } from '../utils/embeddings';
import { loadVectorStore } from '../utils/vector_store';
import { type MongoClient } from 'mongodb';

export async function POST(request: Request) {
// export async function removePdfData(docId: string){
  const { documentId } = await request.json();  
  const namespace = documentId
  //Remove from PG
  const deletedDoc = await prisma.document.delete({
    where: {
      id: namespace          
    },
    select: {
      fileUrl:true
    }
  });
  
  let mongoDbClient: MongoClient | null = null;
  try{

    //Remove PDF from Bytescale CDN  
    await deleteFile({
      'queryString': {
        filePath: deletedDoc.fileUrl.substring(deletedDoc.fileUrl.indexOf("/uploads"))
      }
    })  
    
    //Remove from VectorStore
    const embeddings = loadEmbeddingsModel();
    const store = await loadVectorStore({
      namespace,
      embeddings
    });
    const vectorstore = store.vectorstore;

    if ('mongoDbClient' in store) {
      mongoDbClient = store.mongoDbClient;
    }
    //Delete vectors from store
    //Only supports Pinecone now.
    const pineconeDeleteParams = {
      // filter: {"docstore_document_id" : namespace},
      deleteAll: true,
      namespace: namespace
    }
    console.log(`pineconeDeleteParams: ${JSON.stringify(pineconeDeleteParams)}`)
    await vectorstore.delete(pineconeDeleteParams);
  }
  catch (error) {
    console.log('error', error);
    return NextResponse.json({ error: 'Failed to delete your data' });
  } finally {
    if (mongoDbClient) {
      await mongoDbClient.close();
    }
  }

  return NextResponse.json({
    text: 'Successfully removed pdf',
    id: namespace,
  });
}
