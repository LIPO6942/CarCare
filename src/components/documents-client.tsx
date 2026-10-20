'use client';

import { useState, useEffect, useRef, type FormEvent } from 'react';
import { useSearchParams } from 'next/navigation';
import type { Vehicle, Document } from '@/lib/types';
import { getVehicles, updateVehicle } from '@/lib/data';
import { addLocalDocument, deleteLocalDocument, getLocalDocumentsForVehicle, updateLocalDocument } from '@/lib/local-db';
import { useAuth } from '@/context/auth-context';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Skeleton } from './ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { PlusCircle, FileText, Trash2, Download, Loader2, Car, Banknote, Calendar, Edit, Fingerprint, Save, ChevronDown, ChevronUp, CheckCircle, RefreshCw, Eye, ChevronLeft, ChevronRight, ExternalLink, Layers, Maximize2, ZoomIn, ZoomOut, X, RotateCcw } from 'lucide-react';
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

const createSafeUrl = (file: any): string | undefined => {
    if (!file) return undefined;
    if (typeof file === 'string') return file;
    if (file instanceof Blob || file instanceof File || (typeof file === 'object' && typeof file.slice === 'function')) {
        try {
            return URL.createObjectURL(file);
        } catch (e) {
            console.error("Error creating object URL:", e);
            return undefined;
        }
    }
    return undefined;
};

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
        if (isNaN(num)) return '0.000 TND';
        return `${num.toLocaleString('fr-FR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} TND`;
    } catch {
        return '0.000 TND';
    }
};

export function DocumentsClient() {
    const { user } = useAuth();
    const [vehicles, setVehicles] = useState<Vehicle[]>([]);
    const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
    const [documents, setDocuments] = useState<Document[]>([]);
    const [isLoadingVehicles, setIsLoadingVehicles] = useState(true);
    const [isLoadingDocuments, setIsLoadingDocuments] = useState(false);

    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [dialogMode, setDialogMode] = useState<'add' | 'edit' | 'renew'>('add');
    const [itemToEdit, setItemToEdit] = useState<Document | null>(null);
    const [viewingDoc, setViewingDoc] = useState<Document | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const [itemToDelete, setItemToDelete] = useState<Document | null>(null);
    const [objectUrls, setObjectUrls] = useState<Map<number, { recto: string; verso?: string }>>(new Map());
    const [isVinEditing, setIsVinEditing] = useState(false);
    const [isVinCollapsed, setIsVinCollapsed] = useState(false);
    const { toast } = useToast();

    const searchParams = useSearchParams();
    const vehicleIdParam = searchParams.get('vehicleId');

    useEffect(() => {
        async function fetchVehicles() {
            if (!user) return;
            setIsLoadingVehicles(true);
            const vehiclesData = await getVehicles(user.uid);
            setVehicles(vehiclesData);
            
            // Priority: URL param > First vehicle in list
            if (vehicleIdParam && vehiclesData.some(v => v.id === vehicleIdParam)) {
                setSelectedVehicleId(vehicleIdParam);
            } else if (vehiclesData.length > 0) {
                setSelectedVehicleId(vehiclesData[0].id);
            }
            setIsLoadingVehicles(false);
        }
        fetchVehicles();
    }, [user, vehicleIdParam]);

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
            const recto = createSafeUrl(doc.fileRecto);
            const verso = createSafeUrl(doc.fileVerso);
            if (recto) {
                newUrls.set(doc.id, { recto, verso });
            }
        });
        setObjectUrls(newUrls);

        return () => {
            newUrls.forEach(urlObj => {
                if (urlObj.recto && urlObj.recto.startsWith('blob:')) {
                    URL.revokeObjectURL(urlObj.recto);
                }
                if (urlObj.verso && urlObj.verso.startsWith('blob:')) {
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

    const handleAdd = () => {
        setItemToEdit(null);
        setDialogMode('add');
        setIsDialogOpen(true);
    };

    const handleEdit = (doc: Document) => {
        setItemToEdit(doc);
        setDialogMode('edit');
        setIsDialogOpen(true);
    };

    const handleRenew = (doc: Document) => {
        setItemToEdit(doc);
        setDialogMode('renew');
        setIsDialogOpen(true);
    };

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

                <Button onClick={handleAdd} className="w-full sm:w-auto ml-auto" disabled={!selectedVehicleId}>
                    <PlusCircle className="mr-2 h-4 w-4" />Ajouter un document
                </Button>
            </div>

            {selectedVehicleId && (
                <Card className="mt-6 overflow-hidden transition-all duration-300">
                    <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors py-4" onClick={() => setIsVinCollapsed(!isVinCollapsed)}>
                        <div className="flex items-center justify-between">
                            <div className="space-y-1">
                                <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                                    <Fingerprint className="h-5 w-5 text-primary" />
                                    Numéro de Châssis (VIN)
                                    {vehicles.find(v => v.id === selectedVehicleId)?.vin && !isVinEditing && (
                                        <CheckCircle className="h-4 w-4 text-green-500 ml-1" />
                                    )}
                                </CardTitle>
                                <CardDescription className="text-xs sm:text-sm">
                                    Gérez le VIN de votre véhicule.
                                </CardDescription>
                            </div>
                            {isVinCollapsed ? <ChevronDown className="h-5 w-5 text-muted-foreground" /> : <ChevronUp className="h-5 w-5 text-muted-foreground" />}
                        </div>
                    </CardHeader>
                    {!isVinCollapsed && (
                        <CardContent className="pt-0 pb-6">
                            <div className="flex flex-col sm:flex-row gap-3 items-end">
                                <div className="flex-1 space-y-2 w-full">
                                    <div className="flex justify-between items-center">
                                        <Label htmlFor="vin-input">VIN du véhicule</Label>
                                        {vehicles.find(v => v.id === selectedVehicleId)?.vin && !isVinEditing && (
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="h-7 px-2 text-xs"
                                                onClick={() => setIsVinEditing(true)}
                                            >
                                                <Edit className="h-3 w-3 mr-1" /> Modifier
                                            </Button>
                                        )}
                                    </div>
                                    <div className="relative">
                                        <Input
                                            id="vin-input"
                                            placeholder="Ex: 17 caractères (VF...)"
                                            value={vehicles.find(v => v.id === selectedVehicleId)?.vin || ''}
                                            onChange={(e) => {
                                                const newVin = e.target.value.toUpperCase();
                                                setVehicles(prev => prev.map(v => v.id === selectedVehicleId ? { ...v, vin: newVin } : v));
                                            }}
                                            maxLength={17}
                                            disabled={!!vehicles.find(v => v.id === selectedVehicleId)?.vin && !isVinEditing}
                                            className={cn(
                                                "uppercase tracking-widest font-mono",
                                                vehicles.find(v => v.id === selectedVehicleId)?.vin && !isVinEditing && "bg-muted text-muted-foreground opacity-70"
                                            )}
                                        />
                                    </div>
                                </div>
                                {(!vehicles.find(v => v.id === selectedVehicleId)?.vin || isVinEditing) && (
                                    <div className="flex gap-2 w-full sm:w-auto">
                                        {isVinEditing && (
                                            <Button
                                                variant="outline"
                                                className="flex-1 sm:flex-none"
                                                onClick={() => setIsVinEditing(false)}
                                            >
                                                Annuler
                                            </Button>
                                        )}
                                        <Button
                                            onClick={async () => {
                                                const vehicle = vehicles.find(v => v.id === selectedVehicleId);
                                                if (vehicle) {
                                                    try {
                                                        await updateVehicle(vehicle.id, { vin: vehicle.vin });
                                                        toast({ title: 'Succès', description: 'Le VIN a été mis à jour.' });
                                                        setIsVinEditing(false);
                                                        // Automatically collapse after a short delay for better UX
                                                        setTimeout(() => setIsVinCollapsed(true), 1500);
                                                    } catch (error) {
                                                        toast({ title: 'Erreur', description: 'Impossible de mettre à jour le VIN.', variant: 'destructive' });
                                                    }
                                                }
                                            }}
                                            className="flex-1 sm:flex-none"
                                        >
                                            <Save className="mr-2 h-4 w-4" /> Enregistrer
                                        </Button>
                                    </div>
                                )}
                            </div>
                        </CardContent>
                    )}
                </Card>
            )}

            <div className="mt-6 space-y-3 sm:space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 px-1">
                    <div>
                        <h2 className="text-base sm:text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
                            <FileText className="h-5 w-5 text-primary" />
                            <span>Documents du Véhicule</span>
                            {documents.length > 0 && (
                                <Badge variant="secondary" className="font-semibold text-xs px-2 py-0.5 rounded-full">
                                    {documents.length}
                                </Badge>
                            )}
                        </h2>
                        <p className="text-xs sm:text-sm text-muted-foreground">
                            Stockez, consultez et gérez tous vos documents importants.
                        </p>
                    </div>
                </div>

                {isLoadingDocuments ? (
                    <div className="text-center py-12 text-muted-foreground border rounded-2xl bg-card/60 backdrop-blur-sm">
                        <Loader2 className="mx-auto h-10 w-10 animate-spin mb-3 text-primary" />
                        <p className="text-sm font-medium">Chargement des documents...</p>
                    </div>
                ) : documents.length > 0 ? (
                    <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 w-full">
                        {documents.map((doc) => {
                            const docUrls = objectUrls.get(doc.id);
                            const hasBoth = Boolean(doc.fileVerso);
                            return (
                                <div
                                    key={doc.id}
                                    className="group relative flex flex-col justify-between w-full rounded-2xl border border-border/80 bg-card/90 hover:bg-card hover:border-primary/40 shadow-sm hover:shadow-md transition-all duration-200 p-3.5 sm:p-4 overflow-hidden"
                                >
                                    <div className="space-y-3">
                                        {/* Card Header: Icon + Info + Actions */}
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="flex items-start gap-2.5 min-w-0">
                                                <div className="p-2 rounded-xl bg-primary/10 text-primary shrink-0 mt-0.5">
                                                    <FileText className="h-4 w-4" />
                                                </div>
                                                <div className="min-w-0">
                                                    <h3 className="font-bold text-sm sm:text-base leading-snug truncate text-foreground" title={doc.name}>
                                                        {doc.name}
                                                    </h3>
                                                    <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                                                        <span className="text-[11px] font-medium text-muted-foreground">
                                                            {doc.type}
                                                        </span>
                                                        <span className="text-[11px] text-muted-foreground/60">•</span>
                                                        <span className="text-[11px] text-muted-foreground">
                                                            {doc.updatedAt ? `Renouvelé le ${safeFormatDate(doc.updatedAt)}` : `Ajouté le ${safeFormatDate(doc.createdAt)}`}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Actions en haut à droite: Modifier & Supprimer UNIQUEMENT (Pas de doublons d'œil ou d'actualisation) */}
                                            <div className="flex items-center gap-0.5 shrink-0 bg-muted/40 rounded-lg p-0.5">
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-7 w-7 text-muted-foreground hover:text-foreground rounded-md"
                                                    title="Modifier"
                                                    onClick={() => handleEdit(doc)}
                                                >
                                                    <Edit className="h-3.5 w-3.5" />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-7 w-7 text-destructive/80 hover:text-destructive hover:bg-destructive/10 rounded-md"
                                                    title="Supprimer"
                                                    onClick={() => setItemToDelete(doc)}
                                                >
                                                    <Trash2 className="h-3.5 w-3.5" />
                                                </Button>
                                            </div>
                                        </div>

                                        {/* Badges / Facture Info / Recto-Verso */}
                                        <div className="flex flex-wrap items-center gap-2">
                                            {hasBoth ? (
                                                <Badge variant="outline" className="text-[10px] px-2 py-0.5 font-semibold bg-primary/5 text-primary border-primary/20 gap-1 rounded-full">
                                                    <Layers className="h-3 w-3" />
                                                    Recto & Verso (2 pages)
                                                </Badge>
                                            ) : (
                                                <Badge variant="outline" className="text-[10px] px-2 py-0.5 font-normal text-muted-foreground border-border/80 rounded-full">
                                                    1 page (Recto)
                                                </Badge>
                                            )}

                                            {doc.type === 'Facture' && (doc.invoiceDate || doc.invoiceAmount) && (
                                                <div className="flex items-center gap-3 text-xs text-muted-foreground bg-muted/40 px-2 py-0.5 rounded-md">
                                                    {doc.invoiceDate && (
                                                        <span className="flex items-center gap-1 font-medium">
                                                            <Calendar className="h-3 w-3 text-primary" /> {safeFormatDate(doc.invoiceDate)}
                                                        </span>
                                                    )}
                                                    {doc.invoiceAmount && (
                                                        <span className="flex items-center gap-1 font-semibold text-foreground">
                                                            <Banknote className="h-3.5 w-3.5 text-primary" /> {safeFormatCurrency(doc.invoiceAmount)}
                                                        </span>
                                                    )}
                                                </div>
                                            )}
                                        </div>

                                        {/* Aperçu miniature cliquable si disponible */}
                                        {docUrls?.recto && (
                                            <div
                                                onClick={() => setViewingDoc(doc)}
                                                className="relative cursor-pointer overflow-hidden rounded-xl border border-border/60 bg-muted/20 hover:border-primary/40 transition-all h-24 sm:h-28 flex items-center justify-center group/thumb"
                                                title="Cliquer pour consulter ce document"
                                            >
                                                <img
                                                    src={docUrls.recto}
                                                    alt={doc.name}
                                                    className="w-full h-full object-cover object-center filter blur-0 opacity-90 group-hover/thumb:opacity-100 group-hover/thumb:scale-105 transition-all duration-300"
                                                />
                                                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent flex items-end justify-between p-2">
                                                    <span className="text-[10px] text-white/90 font-medium flex items-center gap-1 backdrop-blur-xs bg-black/40 px-2 py-0.5 rounded-full">
                                                        <Eye className="h-3 w-3" /> Aperçu
                                                    </span>
                                                    {hasBoth && (
                                                        <span className="text-[10px] text-white/90 font-medium flex items-center gap-1 backdrop-blur-xs bg-primary/70 px-2 py-0.5 rounded-full">
                                                            <Layers className="h-3 w-3" /> 2 faces
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* Boutons d'action clairs et non dupliqués */}
                                    <div className="flex items-center gap-2 pt-3 mt-1 border-t border-border/50">
                                        <Button
                                            variant="default"
                                            size="sm"
                                            className="flex-1 h-9 text-xs sm:text-sm font-semibold gap-1.5 shadow-sm"
                                            disabled={!docUrls?.recto}
                                            onClick={() => setViewingDoc(doc)}
                                        >
                                            <Eye className="h-3.5 w-3.5" />
                                            <span>Consulter</span>
                                        </Button>

                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => handleRenew(doc)}
                                            className="h-9 px-3 text-xs sm:text-sm font-medium border-border hover:border-primary hover:text-primary hover:bg-primary/5 transition-colors gap-1.5 shrink-0"
                                            title="Renouveler ce document"
                                        >
                                            <RefreshCw className="h-3.5 w-3.5 text-primary" />
                                            <span>Renouveler</span>
                                        </Button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <div className="text-center py-12 text-muted-foreground border rounded-2xl bg-card">
                        <FileText className="mx-auto h-12 w-12 mb-3 text-muted-foreground/60" />
                        <h3 className="text-base font-semibold text-foreground">Aucun document</h3>
                        <p className="text-xs sm:text-sm">Ajoutez les documents importants de votre véhicule.</p>
                    </div>
                )}
            </div>
            {selectedVehicleId && <DocumentDialog
                key={itemToEdit ? `${dialogMode}-${itemToEdit.id}` : `add-${dialogMode}`}
                open={isDialogOpen}
                onOpenChange={setIsDialogOpen}
                vehicleId={selectedVehicleId}
                onDataChange={onDataChange}
                initialData={itemToEdit}
                mode={dialogMode}
                existingDocuments={documents}
            />}

            <DocumentViewerDialog
                doc={viewingDoc}
                docUrls={viewingDoc ? objectUrls.get(viewingDoc.id) : undefined}
                open={!!viewingDoc}
                onOpenChange={(open) => {
                    if (!open) setViewingDoc(null);
                }}
                onRenew={handleRenew}
            />

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


function suggestNextName(currentName: string): string {
    const yearMatch = currentName.match(/\b(20\d\d)\b/);
    if (yearMatch) {
        const nextYear = parseInt(yearMatch[1], 10) + 1;
        return currentName.replace(yearMatch[1], String(nextYear));
    }
    const currentYear = new Date().getFullYear();
    return `${currentName} (${currentYear})`;
}

function DocumentDialog({
    open,
    onOpenChange,
    vehicleId,
    onDataChange,
    initialData,
    mode = 'add',
    existingDocuments = []
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    vehicleId: string;
    onDataChange: () => void;
    initialData: Document | null;
    mode: 'add' | 'edit' | 'renew';
    existingDocuments: Document[];
}) {
    const { toast } = useToast();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [files, setFiles] = useState<{ recto: File | null; verso: File | null }>({ recto: null, verso: null });
    const [docType, setDocType] = useState<Document['type'] | ''>(initialData?.type || '');
    const [docName, setDocName] = useState<string>('');
    const [docToReplaceId, setDocToReplaceId] = useState<number | null>(null);
    const fileInputRectoRef = useRef<HTMLInputElement>(null);
    const fileInputVersoRef = useRef<HTMLInputElement>(null);

    const documentTypes: Document['type'][] = [
        'Carte Grise',
        'Assurance',
        'Facture',
        'Visite Technique',
        'Permis de Conduite',
        'CIN',
        'Vignette',
        'Autre'
    ];

    useEffect(() => {
        if (!open) {
            setFiles({ recto: null, verso: null });
            setDocType('');
            setDocName('');
            setDocToReplaceId(null);
            if (fileInputRectoRef.current) fileInputRectoRef.current.value = '';
            if (fileInputVersoRef.current) fileInputVersoRef.current.value = '';
        } else {
            if (mode === 'renew' && initialData) {
                setDocType(initialData.type);
                setDocName(suggestNextName(initialData.name));
                setDocToReplaceId(initialData.id);
            } else if (mode === 'edit' && initialData) {
                setDocType(initialData.type);
                setDocName(initialData.name);
                setDocToReplaceId(null);
            } else {
                setDocType('');
                setDocName('');
                setDocToReplaceId(null);
            }
        }
    }, [open, initialData, mode]);

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>, side: 'recto' | 'verso') => {
        if (event.target.files && event.target.files[0]) {
            setFiles(prev => ({ ...prev, [side]: event.target.files![0] }));
        }
    };

    const handleTypeChange = (newType: Document['type']) => {
        setDocType(newType);
        if (mode === 'add') {
            setDocToReplaceId(null);
        }
    };

    const matchingExistingDocs = mode === 'add' && docType
        ? existingDocuments.filter(d => d.type === docType)
        : [];

    const isReplacing = (mode === 'renew' && !!initialData) || (mode === 'add' && docToReplaceId !== null);

    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();

        if (mode === 'add' && !docToReplaceId && !files.recto) {
            toast({ title: 'Erreur', description: 'Veuillez sélectionner un fichier (recto) pour le nouveau document.', variant: 'destructive' });
            return;
        }

        if (mode === 'renew' && !files.recto) {
            toast({ title: 'Erreur', description: 'Veuillez sélectionner le nouveau fichier (recto) pour le renouvellement.', variant: 'destructive' });
            return;
        }

        if (mode === 'add' && docToReplaceId !== null && !files.recto) {
            toast({ title: 'Erreur', description: 'Veuillez sélectionner le fichier du nouveau document de remplacement.', variant: 'destructive' });
            return;
        }

        if (!docType) {
            toast({ title: 'Erreur', description: 'Veuillez sélectionner un type de document.', variant: 'destructive' });
            return;
        }

        setIsSubmitting(true);
        const formData = new FormData(event.currentTarget);
        const name = (formData.get('name') as string)?.trim() || docName || (files.recto ? files.recto.name.replace(/\.[^/.]+$/, "") : 'Document');

        try {
            const invoiceDate = docType === 'Facture' ? ((formData.get('invoiceDate') as string) || undefined) : undefined;
            const invoiceAmountRaw = docType === 'Facture' ? (formData.get('invoiceAmount') as string) : undefined;
            const invoiceAmount = invoiceAmountRaw ? parseFloat(invoiceAmountRaw) : undefined;

            const targetId = (mode === 'renew' && initialData) ? initialData.id : docToReplaceId;

            if (targetId !== null && targetId !== undefined) {
                // Remplacement / Renouvellement : mise à jour en écrasant l'ancien fichier
                await updateLocalDocument(
                    targetId,
                    {
                        name,
                        type: docType,
                        invoiceDate,
                        invoiceAmount,
                    },
                    files.recto || files.verso ? {
                        recto: files.recto,
                        verso: files.verso,
                    } : undefined
                );
                toast({
                    title: "Succès",
                    description: mode === 'renew' ? "Document renouvelé avec succès." : "Document remplacé avec succès."
                });
            } else if (mode === 'edit' && initialData) {
                // Modification standard
                await updateLocalDocument(
                    initialData.id,
                    {
                        name,
                        type: docType,
                        invoiceDate,
                        invoiceAmount,
                    },
                    files.recto || files.verso ? {
                        recto: files.recto,
                        verso: files.verso,
                    } : undefined
                );
                toast({ title: "Succès", description: "Document mis à jour." });
            } else {
                // Ajout d'un nouveau document
                const documentInfo: Omit<Document, 'id' | 'vehicleId' | 'fileRecto' | 'fileVerso' | 'createdAt'> & { vehicleId?: string } = {
                    name,
                    type: docType,
                    invoiceDate,
                    invoiceAmount,
                };
                await addLocalDocument(vehicleId, files as { recto: File; verso?: File | null }, documentInfo);
                toast({ title: "Succès", description: "Document ajouté localement." });
            }

            onOpenChange(false);
            onDataChange();

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "Impossible d'enregistrer le document.";
            toast({ title: "Erreur de stockage local", description: errorMessage, variant: 'destructive' });
        } finally {
            setIsSubmitting(false);
        }
    };

    let dialogTitle = "Ajouter un document";
    let dialogDesc = "Téléchargez les fichiers qui seront stockés localement dans votre navigateur.";

    if (mode === 'renew') {
        dialogTitle = `Renouveler : ${initialData?.name || 'Document'}`;
        dialogDesc = "Importez la nouvelle version du document pour remplacer l'ancienne sans la recréer.";
    } else if (mode === 'edit') {
        dialogTitle = `Modifier le document`;
        dialogDesc = "Modifiez les informations ou mettez à jour les fichiers du document.";
    } else if (isReplacing) {
        dialogTitle = "Remplacer un document existant";
        dialogDesc = "Le document existant sélectionné sera remplacé par le nouveau fichier.";
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>{dialogTitle}</DialogTitle>
                    <DialogDescription>{dialogDesc}</DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4 pt-4">
                    <div className="space-y-2">
                        <Label htmlFor="doc-name">Nom du document</Label>
                        <Input
                            id="doc-name"
                            name="name"
                            placeholder="Ex: Assurance 2026, Facture garage..."
                            required
                            value={docName}
                            onChange={(e) => setDocName(e.target.value)}
                        />
                    </div>

                    <div className="space-y-2">
                        <Label>Type de document</Label>
                        <Select
                            onValueChange={(value) => handleTypeChange(value as Document['type'])}
                            value={docType}
                            required
                            disabled={mode === 'renew'}
                        >
                            <SelectTrigger>
                                <SelectValue placeholder="Sélectionnez un type" />
                            </SelectTrigger>
                            <SelectContent>
                                {documentTypes.map(type => (
                                    <SelectItem key={type} value={type}>
                                        {type}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {mode === 'add' && matchingExistingDocs.length > 0 && (
                        <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-2">
                            <div className="flex items-center gap-1.5 text-xs font-semibold text-primary">
                                <RefreshCw className="h-3.5 w-3.5" />
                                Document « {docType} » déjà existant
                            </div>
                            <p className="text-xs text-muted-foreground">
                                Un document de ce type existe déjà. Souhaitez-vous le remplacer par cette nouvelle version ?
                            </p>
                            <div className="grid grid-cols-2 gap-2 pt-1">
                                <button
                                    type="button"
                                    onClick={() => setDocToReplaceId(null)}
                                    className={cn(
                                        "p-2 text-xs rounded-md border text-center transition-all",
                                        docToReplaceId === null
                                            ? "border-primary bg-primary text-primary-foreground font-medium shadow-sm"
                                            : "border-border bg-background hover:bg-muted text-foreground"
                                    )}
                                >
                                    Nouveau document
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (matchingExistingDocs.length > 0) {
                                            const target = matchingExistingDocs[0];
                                            setDocToReplaceId(target.id);
                                            setDocName(suggestNextName(target.name));
                                        }
                                    }}
                                    className={cn(
                                        "p-2 text-xs rounded-md border text-center transition-all",
                                        docToReplaceId !== null
                                            ? "border-primary bg-primary text-primary-foreground font-medium shadow-sm"
                                            : "border-border bg-background hover:bg-muted text-foreground"
                                    )}
                                >
                                    Remplacer l'existant
                                </button>
                            </div>
                            {docToReplaceId !== null && matchingExistingDocs.length > 1 && (
                                <div className="pt-2 space-y-1">
                                    <Label className="text-xs">Document à remplacer :</Label>
                                    <Select
                                        value={String(docToReplaceId)}
                                        onValueChange={(val) => {
                                            const target = matchingExistingDocs.find(d => d.id === Number(val));
                                            setDocToReplaceId(Number(val));
                                            if (target) setDocName(suggestNextName(target.name));
                                        }}
                                    >
                                        <SelectTrigger className="h-8 text-xs">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {matchingExistingDocs.map(d => (
                                                <SelectItem key={d.id} value={String(d.id)} className="text-xs">
                                                    {d.name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            )}
                        </div>
                    )}

                    {docType === 'Facture' && (
                        <div className="space-y-4 rounded-md border p-4">
                            <h4 className="text-sm font-medium">Détails de la facture (Optionnel)</h4>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="invoiceDate">Date</Label>
                                    <Input id="invoiceDate" name="invoiceDate" type="date" defaultValue={initialData?.invoiceDate?.split('T')[0]} />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="invoiceAmount">Montant (TND)</Label>
                                    <Input id="invoiceAmount" name="invoiceAmount" type="number" step="0.001" placeholder="Ex: 250" defaultValue={initialData?.invoiceAmount} />
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="space-y-3">
                        <div className="space-y-1.5">
                            <Label htmlFor="file-upload-recto">
                                {mode === 'edit'
                                    ? "Remplacer le fichier Recto (Optionnel)"
                                    : (isReplacing ? "Nouveau fichier Recto (Obligatoire)" : "Fichier Recto (Obligatoire)")}
                            </Label>
                            <Input
                                id="file-upload-recto"
                                type="file"
                                required={mode !== 'edit'}
                                onChange={(e) => handleFileChange(e, 'recto')}
                                ref={fileInputRectoRef}
                            />
                            {mode === 'edit' && (
                                <p className="text-xs text-muted-foreground">Laisser vide pour conserver le fichier Recto actuel.</p>
                            )}
                        </div>

                        <div className="space-y-1.5">
                            <Label htmlFor="file-upload-verso">
                                {mode === 'edit'
                                    ? "Remplacer le fichier Verso (Optionnel)"
                                    : (isReplacing ? "Nouveau fichier Verso (Optionnel)" : "Fichier Verso (Optionnel)")}
                            </Label>
                            <Input
                                id="file-upload-verso"
                                type="file"
                                onChange={(e) => handleFileChange(e, 'verso')}
                                ref={fileInputVersoRef}
                            />
                            {mode === 'edit' && (
                                <p className="text-xs text-muted-foreground">Laisser vide pour conserver le fichier Verso actuel.</p>
                            )}
                        </div>
                    </div>

                    <DialogFooter>
                        <Button type="button" variant="secondary" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
                            Annuler
                        </Button>
                        <Button type="submit" disabled={isSubmitting}>
                            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            {mode === 'renew' ? 'Renouveler' : (isReplacing ? 'Remplacer' : (mode === 'edit' ? 'Enregistrer' : 'Ajouter'))}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
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

function DocumentViewerDialog({
    doc,
    docUrls,
    open,
    onOpenChange,
    onRenew,
}: {
    doc: Document | null;
    docUrls?: { recto: string; verso?: string };
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onRenew?: (doc: Document) => void;
}) {
    const [fullscreenSide, setFullscreenSide] = useState<'recto' | 'verso' | null>(null);
    const [zoomScale, setZoomScale] = useState<number>(1);
    const [localUrls, setLocalUrls] = useState<{ recto?: string; verso?: string }>({});
    const touchStartX = useRef<number | null>(null);

    // Ensure we always have valid URLs for both recto and verso
    useEffect(() => {
        if (!doc) return;
        const r = docUrls?.recto || createSafeUrl(doc.fileRecto);
        const v = docUrls?.verso || createSafeUrl(doc.fileVerso);
        setLocalUrls({ recto: r, verso: v });

        return () => {
            if (!docUrls?.recto && r?.startsWith('blob:')) URL.revokeObjectURL(r);
            if (!docUrls?.verso && v?.startsWith('blob:')) URL.revokeObjectURL(v);
        };
    }, [doc, docUrls]);

    const effectiveRectoUrl = docUrls?.recto || localUrls.recto;
    const effectiveVersoUrl = docUrls?.verso || localUrls.verso;
    const hasBoth = Boolean(doc?.fileVerso && (effectiveVersoUrl || doc.fileVerso));

    useEffect(() => {
        if (!open) {
            setFullscreenSide(null);
            setZoomScale(1);
        }
    }, [open]);

    const toggleSide = () => {
        if (!hasBoth) return;
        setFullscreenSide(prev => (prev === 'recto' ? 'verso' : 'recto'));
        setZoomScale(1);
    };

    // Keyboard navigation in Fullscreen Lightbox
    useEffect(() => {
        if (!fullscreenSide) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                setFullscreenSide(null);
                setZoomScale(1);
            } else if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && hasBoth) {
                toggleSide();
            } else if (e.key === '+' || e.key === '=') {
                setZoomScale(z => Math.min(3, Number((z + 0.25).toFixed(2))));
            } else if (e.key === '-') {
                setZoomScale(z => Math.max(0.5, Number((z - 0.25).toFixed(2))));
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [fullscreenSide, hasBoth]);

    const handleTouchStart = (e: React.TouchEvent) => {
        touchStartX.current = e.touches[0].clientX;
    };

    const handleTouchEnd = (e: React.TouchEvent) => {
        if (touchStartX.current === null) return;
        const diff = e.changedTouches[0].clientX - touchStartX.current;
        if (Math.abs(diff) > 40 && hasBoth) {
            toggleSide();
        }
        touchStartX.current = null;
    };

    if (!doc || !effectiveRectoUrl) return null;

    const isPdf = (file?: File) => {
        if (!file) return false;
        return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    };

    const activeFullscreenUrl = fullscreenSide === 'recto' ? effectiveRectoUrl : (effectiveVersoUrl || effectiveRectoUrl);
    const activeFullscreenFile = fullscreenSide === 'recto' ? doc.fileRecto : (doc.fileVerso || doc.fileRecto);

    const renderLayerCard = (side: 'recto' | 'verso', file?: File, url?: string, label?: string) => {
        if (!url || !file) return null;
        const isFilePdf = isPdf(file);

        return (
            <div className="rounded-2xl border border-border/80 bg-card/60 backdrop-blur-xs p-3 sm:p-4 space-y-2.5 transition-all hover:border-primary/40 hover:shadow-md group">
                <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                        <Badge
                            variant={side === 'recto' ? 'default' : 'secondary'}
                            className="text-xs font-semibold px-2.5 py-0.5 rounded-full shadow-2xs"
                        >
                            {side === 'recto' ? 'Page 1 • Recto' : 'Page 2 • Verso'}
                        </Badge>
                        <span className="text-xs text-muted-foreground font-medium hidden sm:inline">
                            {side === 'recto' ? 'Face avant' : 'Face arrière'}
                        </span>
                        <span className="text-[11px] text-muted-foreground/60 hidden md:inline truncate max-w-[200px]">
                            {file.name}
                        </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs px-2.5 gap-1.5 font-medium text-primary hover:text-primary hover:bg-primary/10 border-primary/25 rounded-lg cursor-pointer"
                            onClick={() => {
                                setFullscreenSide(side);
                                setZoomScale(1);
                            }}
                        >
                            <Maximize2 className="h-3.5 w-3.5" />
                            <span>Agrandir plein écran</span>
                        </Button>
                        <Button
                            asChild
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs px-2 text-muted-foreground hover:text-foreground rounded-lg"
                            title={`Télécharger ${side}`}
                        >
                            <a href={url} download={file.name || `${doc.name}-${side}`}>
                                <Download className="h-3.5 w-3.5" />
                            </a>
                        </Button>
                    </div>
                </div>

                {/* Photo Viewer Frame (click to open fullscreen) */}
                <div
                    onClick={() => {
                        setFullscreenSide(side);
                        setZoomScale(1);
                    }}
                    className={cn(
                        "relative cursor-zoom-in overflow-hidden rounded-xl border border-border/60 bg-muted/30 hover:border-primary/60 transition-all flex items-center justify-center p-2 group/layer select-none",
                        isFilePdf ? "min-h-[350px]" : "min-h-[200px] sm:min-h-[260px] max-h-[50vh]"
                    )}
                    title="Cliquer pour afficher en plein écran"
                >
                    {isFilePdf ? (
                        <iframe
                            src={url}
                            title={`${label || 'Document'} - ${doc.name}`}
                            className="w-full h-[45vh] rounded-lg border-0 bg-background"
                        />
                    ) : (
                        <>
                            <img
                                src={url}
                                alt={`${label || 'Document'} - ${doc.name}`}
                                className="max-h-[46vh] max-w-full object-contain rounded-lg shadow-sm transition-transform duration-300 group-hover/layer:scale-[1.01]"
                            />
                            {/* Hover overlay hint */}
                            <div className="absolute inset-0 bg-black/30 opacity-0 group-hover/layer:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-[0.5px]">
                                <div className="bg-background/95 text-foreground px-4 py-2 rounded-full text-xs font-semibold shadow-xl flex items-center gap-2 border border-border">
                                    <Maximize2 className="h-3.5 w-3.5 text-primary" />
                                    <span>Cliquer pour agrandir en plein écran</span>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>
        );
    };

    return (
        <>
            <Dialog open={open} onOpenChange={onOpenChange}>
                <DialogContent className="w-[95vw] sm:max-w-4xl max-h-[92vh] flex flex-col p-3 sm:p-6 overflow-hidden rounded-2xl">
                    <DialogHeader className="space-y-1 pb-3 border-b border-border/60">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pr-6">
                            <div>
                                <DialogTitle className="flex items-center gap-2 text-base sm:text-xl font-bold">
                                    <FileText className="h-5 w-5 text-primary" />
                                    <span className="truncate">{doc.name}</span>
                                </DialogTitle>
                                <DialogDescription className="text-xs flex items-center gap-2 mt-0.5">
                                    <span>{doc.type}</span>
                                    <span>•</span>
                                    <span>{doc.updatedAt ? `Renouvelé le ${safeFormatDate(doc.updatedAt)}` : `Ajouté le ${safeFormatDate(doc.createdAt)}`}</span>
                                </DialogDescription>
                            </div>

                            {/* Badge indiquant les layers Recto & Verso */}
                            {hasBoth ? (
                                <Badge variant="outline" className="text-xs px-2.5 py-1 font-semibold bg-primary/5 text-primary border-primary/20 gap-1.5 self-start sm:self-auto rounded-full">
                                    <Layers className="h-3.5 w-3.5" />
                                    Vue en layers (Recto & Verso)
                                </Badge>
                            ) : (
                                <Badge variant="outline" className="text-xs px-2.5 py-1 font-normal text-muted-foreground self-start sm:self-auto rounded-full">
                                    Document 1 face (Recto)
                                </Badge>
                            )}
                        </div>
                    </DialogHeader>

                    {/* Content: View in LAYERS (une photo au-dessus de l'autre) */}
                    <div className="flex-1 overflow-y-auto py-3 space-y-4 pr-1">
                        {/* Layer 1: Recto */}
                        {renderLayerCard('recto', doc.fileRecto, effectiveRectoUrl, 'Recto')}

                        {/* Layer 2: Verso (au-dessous de Recto) */}
                        {hasBoth && renderLayerCard('verso', doc.fileVerso, effectiveVersoUrl, 'Verso')}
                    </div>

                    <DialogFooter className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-2 pt-3 border-t border-border/60">
                        <div className="flex flex-wrap items-center gap-2">
                            {effectiveRectoUrl && (
                                <Button asChild variant="outline" size="sm" className="h-8 text-xs rounded-lg">
                                    <a href={effectiveRectoUrl} download={doc.fileRecto?.name || `${doc.name}-recto`}>
                                        <Download className="h-3.5 w-3.5 mr-1.5" />
                                        Télécharger Recto
                                    </a>
                                </Button>
                            )}
                            {hasBoth && effectiveVersoUrl && (
                                <Button asChild variant="outline" size="sm" className="h-8 text-xs rounded-lg">
                                    <a href={effectiveVersoUrl} download={doc.fileVerso?.name || `${doc.name}-verso`}>
                                        <Download className="h-3.5 w-3.5 mr-1.5" />
                                        Télécharger Verso
                                    </a>
                                </Button>
                            )}
                        </div>

                        <div className="flex items-center gap-2">
                            <Button
                                variant="secondary"
                                size="sm"
                                className="h-8 text-xs font-medium rounded-lg cursor-pointer"
                                onClick={() => {
                                    onOpenChange(false);
                                    if (onRenew) onRenew(doc);
                                }}
                            >
                                <RefreshCw className="h-3.5 w-3.5 mr-1.5 text-primary" />
                                Renouveler
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                className="h-8 text-xs rounded-lg cursor-pointer"
                                onClick={() => onOpenChange(false)}
                            >
                                Fermer
                            </Button>
                        </div>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* LIGHTBOX PLEIN ÉCRAN INTERACTIVE AU CLIC SUR UNE DES PHOTOS (NESTED DIALOG PORTAL) */}
            <Dialog
                open={!!fullscreenSide}
                onOpenChange={(isOpen) => {
                    if (!isOpen) {
                        setFullscreenSide(null);
                        setZoomScale(1);
                    }
                }}
            >
                <DialogContent className="!fixed !inset-0 !top-0 !left-0 !translate-x-0 !translate-y-0 !w-screen !h-screen !max-w-none !max-h-none !p-0 !m-0 !border-0 !rounded-none !bg-black/95 !backdrop-blur-md flex flex-col justify-between text-white select-none z-[200] overflow-hidden outline-none [&>button:last-child]:hidden">
                    <DialogTitle className="sr-only">
                        {doc.name} - {fullscreenSide === 'recto' ? 'Recto' : 'Verso'}
                    </DialogTitle>
                    <DialogDescription className="sr-only">
                        Affichage plein écran du document
                    </DialogDescription>

                    {/* Top Toolbar */}
                    <div className="h-14 px-3 sm:px-6 flex items-center justify-between border-b border-white/10 bg-black/50 backdrop-blur-md shrink-0 z-50">
                        <div className="flex items-center gap-2 min-w-0">
                            <span className="font-semibold text-sm sm:text-base text-white truncate max-w-[140px] sm:max-w-xs">
                                {doc.name}
                            </span>
                            <Badge className="bg-primary text-primary-foreground text-xs font-semibold rounded-full px-2.5 py-0.5">
                                {fullscreenSide === 'recto' ? 'Page 1 • Recto' : 'Page 2 • Verso'}
                            </Badge>
                        </div>

                        {/* Switcher Recto / Verso si disponible */}
                        {hasBoth && (
                            <div className="flex items-center bg-white/10 p-1 rounded-xl border border-white/15 gap-1 z-50">
                                <button
                                    type="button"
                                    onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        setFullscreenSide('recto');
                                        setZoomScale(1);
                                    }}
                                    className={cn(
                                        "px-3.5 py-1.5 text-xs rounded-lg font-bold transition-all cursor-pointer",
                                        fullscreenSide === 'recto'
                                            ? "bg-primary text-primary-foreground shadow-md scale-105"
                                            : "text-white/80 hover:text-white hover:bg-white/10"
                                    )}
                                >
                                    Recto
                                </button>
                                <button
                                    type="button"
                                    onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        setFullscreenSide('verso');
                                        setZoomScale(1);
                                    }}
                                    className={cn(
                                        "px-3.5 py-1.5 text-xs rounded-lg font-bold transition-all cursor-pointer",
                                        fullscreenSide === 'verso'
                                            ? "bg-primary text-primary-foreground shadow-md scale-105"
                                            : "text-white/80 hover:text-white hover:bg-white/10"
                                    )}
                                >
                                    Verso
                                </button>
                            </div>
                        )}

                        {/* Actions Plein Écran: Zoom, Télécharger, Fermer */}
                        <div className="flex items-center gap-1 sm:gap-1.5 z-50">
                            <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8 text-white hover:bg-white/20 rounded-md cursor-pointer"
                                title="Zoom arrière (-)"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setZoomScale(z => Math.max(0.5, Number((z - 0.25).toFixed(2))));
                                }}
                            >
                                <ZoomOut className="h-4 w-4" />
                            </Button>
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setZoomScale(1);
                                }}
                                className="text-xs font-mono px-2 py-1 rounded bg-white/10 hover:bg-white/20 text-white/90 cursor-pointer"
                                title="Réinitialiser zoom"
                            >
                                {Math.round(zoomScale * 100)}%
                            </button>
                            <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8 text-white hover:bg-white/20 rounded-md cursor-pointer"
                                title="Zoom avant (+)"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setZoomScale(z => Math.min(3, Number((z + 0.25).toFixed(2))));
                                }}
                            >
                                <ZoomIn className="h-4 w-4" />
                            </Button>
                            {activeFullscreenUrl && (
                                <Button
                                    asChild
                                    size="icon"
                                    variant="ghost"
                                    className="h-8 w-8 text-white hover:bg-white/20 rounded-md cursor-pointer"
                                    title="Télécharger"
                                >
                                    <a
                                        href={activeFullscreenUrl}
                                        download={activeFullscreenFile?.name || `${doc.name}-${fullscreenSide}`}
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        <Download className="h-4 w-4" />
                                    </a>
                                </Button>
                            )}
                            <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                className="h-9 w-9 rounded-full bg-white/15 hover:bg-white/30 text-white ml-2 cursor-pointer"
                                title="Fermer (Échap)"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setFullscreenSide(null);
                                    setZoomScale(1);
                                }}
                            >
                                <X className="h-5 w-5" />
                            </Button>
                        </div>
                    </div>

                    {/* Canvas Image Plein Écran */}
                    <div
                        className="flex-1 w-full h-full overflow-auto flex items-center justify-center p-2 sm:p-6 relative cursor-default"
                        onTouchStart={handleTouchStart}
                        onTouchEnd={handleTouchEnd}
                        onClick={(e) => {
                            if (e.target === e.currentTarget) {
                                setFullscreenSide(null);
                                setZoomScale(1);
                            }
                        }}
                    >
                        {isPdf(activeFullscreenFile) ? (
                            <iframe
                                src={activeFullscreenUrl}
                                title={`${doc.name} - Plein écran`}
                                className="w-full h-full max-h-[85vh] rounded-lg border-0 bg-white"
                            />
                        ) : activeFullscreenUrl ? (
                            <img
                                src={activeFullscreenUrl}
                                alt={`${doc.name} - ${fullscreenSide}`}
                                style={{
                                    transform: `scale(${zoomScale})`,
                                    transformOrigin: 'center center',
                                }}
                                className="max-h-[84vh] max-w-[95vw] object-contain transition-transform duration-200 cursor-zoom-in rounded-lg shadow-2xl select-none"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setZoomScale(z => (z === 1 ? 1.75 : 1));
                                }}
                                title="Cliquer pour basculer le zoom"
                            />
                        ) : null}

                        {/* Flèches de navigation gauche/droite si Recto & Verso */}
                        {hasBoth && (
                            <>
                                <button
                                    type="button"
                                    onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        toggleSide();
                                    }}
                                    className="absolute left-3 sm:left-6 top-1/2 -translate-y-1/2 z-40 h-12 w-12 sm:h-16 sm:w-16 rounded-full bg-black/75 hover:bg-primary text-white hover:text-primary-foreground border border-white/30 hover:border-primary shadow-2xl backdrop-blur-md flex items-center justify-center transition-all cursor-pointer active:scale-95 group/arrow"
                                    title="Basculer vers l'autre face (Recto / Verso)"
                                >
                                    <ChevronLeft className="h-7 w-7 sm:h-9 sm:w-9 transition-transform group-hover/arrow:-translate-x-0.5" />
                                </button>
                                <button
                                    type="button"
                                    onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        toggleSide();
                                    }}
                                    className="absolute right-3 sm:right-6 top-1/2 -translate-y-1/2 z-40 h-12 w-12 sm:h-16 sm:w-16 rounded-full bg-black/75 hover:bg-primary text-white hover:text-primary-foreground border border-white/30 hover:border-primary shadow-2xl backdrop-blur-md flex items-center justify-center transition-all cursor-pointer active:scale-95 group/arrow"
                                    title="Basculer vers l'autre face (Recto / Verso)"
                                >
                                    <ChevronRight className="h-7 w-7 sm:h-9 sm:w-9 transition-transform group-hover/arrow:translate-x-0.5" />
                                </button>
                            </>
                        )}
                    </div>

                    {/* Bottom Toolbar & Switcher */}
                    <div className="py-2.5 px-4 flex items-center justify-between border-t border-white/10 bg-black/50 text-[11px] sm:text-xs text-white/70 shrink-0 z-30">
                        <div className="hidden sm:block">
                            Cliquer sur l&apos;image pour zoomer • Échap pour fermer
                        </div>

                        {hasBoth && (
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    toggleSide();
                                }}
                                className="mx-auto sm:mx-0 flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white/15 hover:bg-primary text-white hover:text-primary-foreground border border-white/20 transition-all font-semibold cursor-pointer shadow-md active:scale-95"
                            >
                                <RefreshCw className="h-3.5 w-3.5" />
                                <span>
                                    Basculer vers {fullscreenSide === 'recto' ? 'Page 2 (Verso)' : 'Page 1 (Recto)'} ➔
                                </span>
                            </button>
                        )}

                        <div className="hidden sm:block text-white/50 text-[10px]">
                            {hasBoth ? "Glisser ou Flèches ← / → pour basculer" : ""}
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
}
