'use client';

import { useState, useEffect, useRef, type FormEvent } from 'react';
import type { Vehicle, Document } from '@/lib/types';
import { getVehicles } from '@/lib/data';
import { addLocalDocument, deleteLocalDocument, getLocalDocumentsForVehicle } from '@/lib/local-db';
import { useAuth } from '@/context/auth-context';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Skeleton } from './ui/skeleton';
import { PlusCircle, FileText, Trash2, Download, Loader2, Car, Euro, Calendar } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Input } from './ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DialogFooter } from './ui/dialog';
import Link from 'next/link';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from './ui/alert-dialog';
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { Label } from './ui/label';
import { cn } from '@/lib/utils';


const safeFormatDate = (dateInput: any, formatString: string = 'P') => {
  try {
    if (!dateInput) return 'N/A';
    let date;
    if (typeof dateInput === 'object' && dateInput !== null && typeof (dateInput as any).toDate === 'function') {
      date = (dateInput as any).toDate();
    } else {
      date = new Date(dateInput);
    }
    if (isNaN(date.getTime())) {
      return 'Date invalide';
    }
    return format(date, formatString, { locale: fr });
  } catch (error) {
    return 'Erreur date';
  }
};

const safeFormatCurrency = (numInput: any): string => {
    try {
        const num = Number(numInput);
        if (isNaN(num)) return (0).toLocaleString('fr-FR', { style: 'currency', currency: 'TND' });
        return num.toLocaleString('fr-FR', { style: 'currency', currency: 'TND' });
    } catch {
        return (0).toLocaleString('fr-FR', { style: 'currency', currency: 'TND' });
    }
}

export function DocumentsClient() {
  const { user } = useAuth();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [isLoadingVehicles, setIsLoadingVehicles] = useState(true);
  const [isLoadingDocuments, setIsLoadingDocuments] = useState(false);
  
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<Document | null>(null);
  const [objectUrls, setObjectUrls] = useState<Map<number, { recto: string; verso?: string }>>(new Map());
  const { toast } = useToast();

  useEffect(() => {
    async function fetchVehicles() {
      if (!user) return;
      setIsLoadingVehicles(true);
      const vehiclesData = await getVehicles(user.uid);
      setVehicles(vehiclesData);
      if (vehiclesData.length > 0) {
        setSelectedVehicleId(vehiclesData[0].id);
      }
      setIsLoadingVehicles(false);
    }
    fetchVehicles();
  }, [user]);

  useEffect(() => {
    async function fetchDocuments() {
      if (!selectedVehicleId) {
        setDocuments([]);
        return;
      };
      setIsLoadingDocuments(true);
      const documentsData = await getLocalDocumentsForVehicle(selectedVehicleId);
      setDocuments(documentsData);
      setIsLoadingDocuments(false);
    }
    fetchDocuments();
  }, [selectedVehicleId]);

  useEffect(() => {
    const newUrls = new Map<number, { recto: string, verso?: string }>();
    documents.forEach(doc => {
        const urls: { recto: string, verso?: string } = {} as any;
        if (doc.fileRecto instanceof File) {
            urls.recto = URL.createObjectURL(doc.fileRecto);
        }
        if (doc.fileVerso instanceof File) {
            urls.verso = URL.createObjectURL(doc.fileVerso);
        }
        if (urls.recto) {
            newUrls.set(doc.id, urls);
        }
    });
    setObjectUrls(newUrls);

    return () => {
        newUrls.forEach(urlObj => {
            URL.revokeObjectURL(urlObj.recto);
            if (urlObj.verso) {
                URL.revokeObjectURL(urlObj.verso);
            }
        });
    };
  }, [documents]);

  const onDataChange = async () => {
    if (!selectedVehicleId) return;
    setIsLoadingDocuments(true);
    const documentsData = await getLocalDocumentsForVehicle(selectedVehicleId);
    setDocuments(documentsData);
    setIsLoadingDocuments(false);
  }

  const handleDeleteConfirm = async () => {
    if (!itemToDelete) return;
    setIsDeleting(true);
    try {
        await deleteLocalDocument(itemToDelete.id);
        toast({ title: 'Succès', description: 'Document supprimé.' });
        onDataChange();
        setItemToDelete(null);
    } catch (error) {
        toast({ title: 'Erreur', description: "Impossible de supprimer le document.", variant: 'destructive' });
    } finally {
        setIsDeleting(false);
    }
  };

  if (isLoadingVehicles) {
    return (
      <div className="space-y-4 mt-6">
        <Skeleton className="h-10 w-full max-w-sm" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (vehicles.length === 0) {
    return (
      <Card className="mt-6">
          <CardHeader>
              <CardTitle>Aucun véhicule</CardTitle>
              <CardDescription>Vous devez d'abord ajouter un véhicule pour pouvoir gérer ses documents.</CardDescription>
          </CardHeader>
          <CardContent className="text-center py-12 text-muted-foreground">
             <Car className="mx-auto h-12 w-12 mb-4" />
             <h3 className="text-lg font-semibold">Aucun véhicule trouvé</h3>
             <p>Veuillez retourner au tableau de bord pour ajouter un véhicule.</p>
          </CardContent>
      </Card>
    )
  }

  return (
    <>
      <div className="flex flex-col sm:flex-row gap-4 mt-6 items-center">
        <Select onValueChange={setSelectedVehicleId} defaultValue={selectedVehicleId || undefined}>
          <SelectTrigger className="w-full sm:w-[300px]">
            <SelectValue placeholder="Sélectionnez un véhicule" />
          </SelectTrigger>
          <SelectContent>
            {vehicles.map(vehicle => (
              <SelectItem key={vehicle.id} value={vehicle.id}>
                {vehicle.brand} {vehicle.model} ({vehicle.licensePlate})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button onClick={() => setIsAddDialogOpen(true)} className="w-full sm:w-auto ml-auto" disabled={!selectedVehicleId}>
          <PlusCircle className="mr-2 h-4 w-4" />Ajouter un document
        </Button>
      </div>

      <Card className="mt-6">
          <CardHeader>
              <CardTitle>Documents du Véhicule</CardTitle>
              <CardDescription>Stockez et consultez tous vos documents importants.</CardDescription>
          </CardHeader>
          <CardContent>
              {isLoadingDocuments ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Loader2 className="mx-auto h-12 w-12 animate-spin mb-4" />
                  <p>Chargement des documents...</p>
                </div>
              ) : documents.length > 0 ? (
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      {documents.map((doc) => {
                          const docUrls = objectUrls.get(doc.id);
                          return (
                          <Card key={doc.id} className="group relative flex flex-col">
                              <CardHeader>
                                  <CardTitle className="flex items-center gap-2 text-lg">
                                      <FileText className="h-5 w-5 text-primary" />
                                      <span className="truncate">{doc.name}</span>
                                  </CardTitle>
                                  <CardDescription>{doc.type} - Ajouté le {safeFormatDate(doc.createdAt)}</CardDescription>
                              </CardHeader>
                              <CardContent className="flex-1 space-y-3">
                                  {doc.type === 'Facture' && (doc.invoiceDate || doc.invoiceAmount) && (
                                    <div className="text-sm text-muted-foreground space-y-1">
                                      {doc.invoiceDate && <p className="flex items-center gap-2"><Calendar className="h-4 w-4" /> {safeFormatDate(doc.invoiceDate)}</p>}
                                      {doc.invoiceAmount && <p className="flex items-center gap-2"><Euro className="h-4 w-4" /> {safeFormatCurrency(doc.invoiceAmount)}</p>}
                                    </div>
                                  )}
                                  <div className="flex gap-2">
                                      <Button asChild variant="secondary" className="flex-1" disabled={!docUrls?.recto}>
                                          <Link href={docUrls?.recto || '#'} target="_blank" rel="noopener noreferrer">
                                              <Download className="mr-2 h-4 w-4"/> Voir Recto
                                          </Link>
                                      </Button>
                                      {docUrls?.verso && (
                                        <Button asChild variant="secondary" className="flex-1">
                                            <Link href={docUrls.verso} target="_blank" rel="noopener noreferrer">
                                                <Download className="mr-2 h-4 w-4"/> Verso
                                            </Link>
                                        </Button>
                                      )}
                                  </div>
                              </CardContent>
                               <Button variant="ghost" size="icon" className="text-destructive absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => setItemToDelete(doc)}>
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                          </Card>
                      )})}
                  </div>
              ) : (
                  <div className="text-center py-12 text-muted-foreground">
                      <FileText className="mx-auto h-12 w-12 mb-4" />
                      <h3 className="text-lg font-semibold">Aucun document</h3>
                      <p>Ajoutez les documents importants de votre véhicule.</p>
                  </div>
              )}
          </CardContent>
      </Card>
      {selectedVehicleId && <AddDocumentDialog
        open={isAddDialogOpen}
        onOpenChange={setIsAddDialogOpen}
        vehicleId={selectedVehicleId}
        onDataChange={onDataChange}
      />}

      <DeleteConfirmationDialog 
          open={!!itemToDelete}
          onOpenChange={() => setItemToDelete(null)}
          onConfirm={handleDeleteConfirm}
          isDeleting={isDeleting}
          title="Supprimer le document ?"
          description="Cette action est irréversible et supprimera définitivement le fichier localement."
      />
    </>
  );
}

// Re-using these small components here to avoid creating more files
function AddDocumentDialog({ open, onOpenChange, vehicleId, onDataChange }: { open: boolean, onOpenChange: (open: boolean) => void, vehicleId: string, onDataChange: () => void }) {
    const { toast } = useToast();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [files, setFiles] = useState<{ recto: File | null; verso: File | null }>({ recto: null, verso: null });
    const [docType, setDocType] = useState<Document['type'] | ''>('');
    const fileInputRectoRef = useRef<HTMLInputElement>(null);
    const fileInputVersoRef = useRef<HTMLInputElement>(null);

    const documentTypes: Document['type'][] = ['Carte Grise', 'Assurance', 'Facture', 'Visite Technique', 'Permis de Conduite', 'Autre'];

    useEffect(() => {
        if (!open) {
            setFiles({ recto: null, verso: null });
            setDocType('');
            if (fileInputRectoRef.current) fileInputRectoRef.current.value = '';
            if (fileInputVersoRef.current) fileInputVersoRef.current.value = '';
        }
    }, [open]);

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>, side: 'recto' | 'verso') => {
        if (event.target.files && event.target.files[0]) {
            setFiles(prev => ({ ...prev, [side]: event.target.files![0] }));
        }
    };

    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!files.recto || !docType) {
            toast({ title: 'Erreur', description: 'Veuillez sélectionner un fichier (recto) et un type de document.', variant: 'destructive' });
            return;
        }

        setIsSubmitting(true);
        const formData = new FormData(event.currentTarget);
        const name = formData.get('name') as string || files.recto.name.replace(/\.[^/.]+$/, "");
        
        const documentInfo: Omit<Document, 'id' | 'vehicleId' | 'fileRecto' | 'fileVerso' | 'createdAt'> & { vehicleId?: string } = {
            name,
            type: docType,
        };

        if (docType === 'Facture') {
            const invoiceDate = formData.get('invoiceDate') as string;
            const invoiceAmount = formData.get('invoiceAmount') as string;
            if (invoiceDate) documentInfo.invoiceDate = invoiceDate;
            if (invoiceAmount) documentInfo.invoiceAmount = parseFloat(invoiceAmount);
        }

        try {
            await addLocalDocument(vehicleId, files, documentInfo);
            toast({ title: "Succès", description: "Document ajouté localement." });
            onOpenChange(false);
            onDataChange();
        } catch (error) {
             const errorMessage = error instanceof Error ? error.message : "Impossible d'ajouter le document localement.";
             toast({ title: "Erreur de stockage local", description: errorMessage, variant: 'destructive' });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Ajouter un document</DialogTitle>
                    <DialogDescription>Téléchargez les fichiers (PDF, image) qui seront stockés dans votre navigateur.</DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4 pt-4">
                     <div className="space-y-2">
                        <Label htmlFor="doc-name">Nom du document</Label>
                        <Input id="doc-name" name="name" placeholder="Ex: Facture garage du 15/05" required/>
                    </div>
                    <div className="space-y-2">
                        <Label>Type de document</Label>
                        <Select onValueChange={(value) => setDocType(value as Document['type'])} value={docType} required>
                            <SelectTrigger>
                                <SelectValue placeholder="Sélectionnez un type" />
                            </SelectTrigger>
                            <SelectContent>
                                {documentTypes.map(type => <SelectItem key={type} value={type}>{type}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>

                    {docType === 'Facture' && (
                        <div className="space-y-4 rounded-md border p-4">
                            <h4 className="text-sm font-medium">Détails de la facture (Optionnel)</h4>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="invoiceDate">Date</Label>
                                    <Input id="invoiceDate" name="invoiceDate" type="date" />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="invoiceAmount">Montant (TND)</Label>
                                    <Input id="invoiceAmount" name="invoiceAmount" type="number" step="0.01" placeholder="Ex: 250"/>
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="space-y-2">
                        <Label htmlFor="file-upload-recto">Fichier Recto (obligatoire)</Label>
                        <Input id="file-upload-recto" type="file" required onChange={(e) => handleFileChange(e, 'recto')} ref={fileInputRectoRef} />
                    </div>
                     <div className="space-y-2">
                        <Label htmlFor="file-upload-verso">Fichier Verso (optionnel)</Label>
                        <Input id="file-upload-verso" type="file" onChange={(e) => handleFileChange(e, 'verso')} ref={fileInputVersoRef} />
                    </div>

                    <DialogFooter>
                        <Button type="button" variant="secondary" onClick={() => onOpenChange(false)} disabled={isSubmitting}>Annuler</Button>
                        <Button type="submit" disabled={isSubmitting}>
                            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Enregistrer
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}

function DeleteConfirmationDialog({ open, onOpenChange, onConfirm, isDeleting, title, description }: { open: boolean, onOpenChange: (open: boolean) => void, onConfirm: () => void, isDeleting: boolean, title: string, description: string }) {
    return (
        <AlertDialog open={open} onOpenChange={onOpenChange}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>{title}</AlertDialogTitle>
                    <AlertDialogDescription>{description}</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Annuler</AlertDialogCancel>
                    <AlertDialogAction
                        disabled={isDeleting}
                        onClick={onConfirm}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                        {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        {isDeleting ? 'Suppression...' : 'Supprimer'}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
